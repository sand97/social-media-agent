import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import {
  BillingPaymentMethod,
  BillingPaymentStatus,
  BillingProvider,
  CreditType,
  Prisma,
  SubscriptionTier,
} from '@app/generated/client';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

import {
  computeCheckoutPricing,
  getMonthlyCreditsForTier,
  isBillingDuration,
  isBillingPlanKey,
  type BillingDuration,
  type BillingPlanKey,
} from './billing.constants';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

type StripeCheckoutSession = {
  id: string;
  url?: string;
  status?: string;
  payment_status?: string;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

type StripeReturnQuery = {
  cancelled?: string | string[];
  reference?: string | string[];
  session_id?: string | string[];
};

type NotchPaymentResponse = {
  authorization_url?: string;
  payment_url?: string;
  transaction?: {
    reference?: string;
    status?: string;
  };
};

type NotchVerifyResponse = {
  transaction?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    id?: string;
  };
};

type NotchReturnQuery = {
  notchpay_trxref?: string | string[];
  reference?: string | string[];
  status?: string | string[];
  trxref?: string | string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    if (!isBillingPlanKey(dto.planKey)) {
      throw new BadRequestException('Plan de souscription invalide.');
    }

    if (!isBillingDuration(dto.durationMonths)) {
      throw new BadRequestException('Durée de souscription invalide.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const phoneNumber = this.resolvePhoneNumber(
      dto.paymentMethod,
      dto.phoneNumber,
      user.phoneNumber,
    );

    const pricing = computeCheckoutPricing(
      dto.planKey,
      dto.durationMonths as BillingDuration,
      dto.paymentMethod,
    );
    const reference = this.generateReference();

    const payment = await this.prisma.billingPayment.create({
      data: {
        amount: pricing.amount,
        creditsAmount: pricing.creditsAmount,
        currency: pricing.currency,
        description: pricing.description,
        durationMonths: dto.durationMonths,
        metadata: {
          planKey: dto.planKey,
        },
        paymentMethod: dto.paymentMethod,
        phoneNumber,
        provider: pricing.provider,
        reference,
        status: BillingPaymentStatus.PENDING,
        subscriptionTier: pricing.tier,
        userId,
      },
    });

    try {
      const checkout =
        pricing.provider === BillingProvider.STRIPE
          ? await this.createStripeCheckoutSession(payment.reference, user, {
              amountInCents: pricing.amountInSmallestUnit,
              durationMonths: dto.durationMonths as BillingDuration,
              planKey: dto.planKey,
              tier: pricing.tier,
            })
          : await this.createNotchPayment(payment.reference, user, {
              amountInXaf: pricing.amountInSmallestUnit,
              phoneNumber,
            });

      await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          metadata: this.mergeMetadata(payment.metadata, checkout.metadata),
          providerCheckoutUrl: checkout.checkoutUrl,
          providerPaymentId: checkout.providerPaymentId,
          providerSessionId: checkout.providerSessionId,
        },
      });

      return {
        amount: pricing.amount,
        checkoutUrl: checkout.checkoutUrl,
        currency: pricing.currency,
        paymentMethod: dto.paymentMethod,
        provider: pricing.provider,
        reference,
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize checkout for payment ${payment.reference}`,
        error,
      );

      await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          failureReason:
            error instanceof Error ? error.message : 'Checkout initialization failed',
          failedAt: new Date(),
          status: BillingPaymentStatus.FAILED,
        },
      });

      throw new InternalServerErrorException(
        "Impossible d'initialiser le paiement pour le moment.",
      );
    }
  }

  async handleStripeReturn(query: StripeReturnQuery) {
    const reference = this.getFirstQueryValue(query.reference);
    const sessionId = this.getFirstQueryValue(query.session_id);
    const cancelledValue = this.getFirstQueryValue(query.cancelled).toLowerCase();
    const isCancelled =
      cancelledValue === '1' ||
      cancelledValue === 'true' ||
      cancelledValue === 'cancelled' ||
      cancelledValue === 'canceled';
    const fallbackReference = reference || 'unknown';

    try {
      if (isCancelled) {
        if (reference) {
          await this.updatePaymentStatus(reference, BillingPaymentStatus.CANCELED, {
            failureReason: 'Paiement Stripe annulé.',
            metadata: query,
          });
        }

        return this.buildFrontendRedirectUrl(
          'cancelled',
          BillingProvider.STRIPE,
          fallbackReference,
          'cancelled',
        );
      }

      if (!reference || !sessionId) {
        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.STRIPE,
          fallbackReference,
          'missing_session',
        );
      }

      const session = await this.fetchStripeCheckoutSession(sessionId);
      const sessionReference =
        session.client_reference_id || session.metadata?.reference;

      if (sessionReference !== reference) {
        this.logger.warn(
          `Stripe return reference mismatch: expected ${reference}, got ${sessionReference}`,
        );
        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.STRIPE,
          reference,
          'reference_mismatch',
        );
      }

      if (
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
      ) {
        await this.processSuccessfulPayment(reference, {
          metadata: session,
          providerPaymentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
          providerSessionId: session.id,
        });

        return this.buildFrontendRedirectUrl(
          'success',
          BillingProvider.STRIPE,
          reference,
        );
      }

      if (session.status === 'expired') {
        await this.updatePaymentStatus(reference, BillingPaymentStatus.EXPIRED, {
          failureReason: 'Session Stripe expirée.',
          metadata: session,
          providerSessionId: session.id,
        });

        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.STRIPE,
          reference,
          'expired',
        );
      }

      await this.updatePaymentStatus(reference, BillingPaymentStatus.PROCESSING, {
        metadata: session,
        providerSessionId: session.id,
      });

      return this.buildFrontendRedirectUrl(
        'pending',
        BillingProvider.STRIPE,
        reference,
      );
    } catch (error) {
      this.logger.error(
        `Stripe return failed for reference ${fallbackReference}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.buildFrontendRedirectUrl(
        'failed',
        BillingProvider.STRIPE,
        fallbackReference,
        'server_error',
      );
    }
  }

  async handleNotchReturn(query: NotchReturnQuery) {
    const parsed = this.parseNotchReturnQuery(query);
    const fallbackReference = parsed.internalReference || 'unknown';

    try {
      if (!parsed.internalReference) {
        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.NOTCH_PAY,
          fallbackReference,
          'no_reference',
        );
      }

      const payment = await this.findNotchPaymentByAnyReference(
        parsed.internalReference,
      );

      if (!payment) {
        this.logger.warn(
          `Notch Pay return: local payment not found for ${parsed.internalReference}`,
        );
        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.NOTCH_PAY,
          parsed.internalReference,
          'payment_not_found',
        );
      }

      const verificationCandidates = [
        ...parsed.providerReferences,
        payment.providerSessionId,
        payment.providerPaymentId,
        parsed.internalReference,
      ];
      const { reference: verifiedReference, verification } =
        await this.verifyNotchPaymentByCandidates(verificationCandidates);
      const status =
        verification.transaction?.status?.toLowerCase() || parsed.status;

      if (
        status === 'complete' ||
        status === 'completed' ||
        status === 'succeeded'
      ) {
        await this.processSuccessfulPayment(payment.reference, {
          metadata: {
            query,
            verification,
          },
          providerPaymentId: verification.transaction?.id || verifiedReference,
          providerSessionId: verifiedReference,
        });

        return this.buildFrontendRedirectUrl(
          'success',
          BillingProvider.NOTCH_PAY,
          payment.reference,
        );
      }

      if (status === 'failed') {
        await this.updatePaymentStatus(payment.reference, BillingPaymentStatus.FAILED, {
          failureReason: 'Paiement Notch Pay échoué.',
          metadata: {
            query,
            verification,
          },
          providerPaymentId: verification.transaction?.id || verifiedReference,
          providerSessionId: verifiedReference,
        });

        return this.buildFrontendRedirectUrl(
          'failed',
          BillingProvider.NOTCH_PAY,
          payment.reference,
          'failed',
        );
      }

      if (status === 'cancelled' || status === 'canceled') {
        await this.updatePaymentStatus(
          payment.reference,
          BillingPaymentStatus.CANCELED,
          {
            failureReason: 'Paiement Notch Pay annulé.',
            metadata: {
              query,
              verification,
            },
            providerPaymentId:
              verification.transaction?.id || verifiedReference,
            providerSessionId: verifiedReference,
          },
        );

        return this.buildFrontendRedirectUrl(
          'cancelled',
          BillingProvider.NOTCH_PAY,
          payment.reference,
          'cancelled',
        );
      }

      await this.updatePaymentStatus(
        payment.reference,
        BillingPaymentStatus.PROCESSING,
        {
          metadata: {
            query,
            verification,
          },
          providerPaymentId: verification.transaction?.id || verifiedReference,
          providerSessionId: verifiedReference,
        },
      );

      return this.buildFrontendRedirectUrl(
        'pending',
        BillingProvider.NOTCH_PAY,
        payment.reference,
      );
    } catch (error) {
      this.logger.error(
        `Notch Pay return failed for reference ${fallbackReference}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.buildFrontendRedirectUrl(
        'failed',
        BillingProvider.NOTCH_PAY,
        fallbackReference,
        'server_error',
      );
    }
  }

  async handleStripeWebhook(rawPayload: Buffer, signatureHeader?: string) {
    if (!signatureHeader) {
      throw new BadRequestException('Stripe-Signature manquant.');
    }

    const payload = rawPayload.toString('utf8');

    if (!this.verifyStripeWebhookSignature(payload, signatureHeader)) {
      throw new BadRequestException('Signature Stripe invalide.');
    }

    const event = safeJsonParse<Record<string, unknown>>(payload);
    const eventType = String(event.type || '');
    const dataObject = isRecord(event.data) && isRecord(event.data.object)
      ? event.data.object
      : null;

    if (!dataObject) {
      return { received: true };
    }

    const session = dataObject as unknown as StripeCheckoutSession;
    const reference =
      session.client_reference_id || session.metadata?.reference || '';

    if (!reference) {
      this.logger.warn(`Stripe webhook ${eventType} ignored: missing reference`);
      return { received: true };
    }

    switch (eventType) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.processSuccessfulPayment(reference, {
          metadata: dataObject,
          providerPaymentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
          providerSessionId: session.id,
        });
        break;
      case 'checkout.session.async_payment_failed':
        await this.updatePaymentStatus(reference, BillingPaymentStatus.FAILED, {
          failureReason: 'Paiement Stripe refusé.',
          metadata: dataObject,
          providerSessionId: session.id,
        });
        break;
      case 'checkout.session.expired':
        await this.updatePaymentStatus(reference, BillingPaymentStatus.EXPIRED, {
          failureReason: 'Session Stripe expirée.',
          metadata: dataObject,
          providerSessionId: session.id,
        });
        break;
      default:
        break;
    }

    return { received: true };
  }

  async handleNotchWebhook(rawPayload: Buffer, signatureHeader?: string) {
    if (!signatureHeader) {
      throw new BadRequestException('x-notch-signature manquant.');
    }

    const payload = rawPayload.toString('utf8');

    if (!this.verifyNotchSignature(payload, signatureHeader)) {
      throw new BadRequestException('Signature Notch Pay invalide.');
    }

    const event = safeJsonParse<Record<string, unknown>>(payload);
    const transaction = isRecord(event.transaction) ? event.transaction : null;
    const reference =
      typeof transaction?.reference === 'string' ? transaction.reference : '';
    const status = typeof transaction?.status === 'string'
      ? transaction.status.toLowerCase()
      : '';

    if (!reference) {
      return { received: true };
    }

    const payment = await this.findNotchPaymentByAnyReference(reference);

    if (!payment) {
      this.logger.warn(
        `Notch Pay webhook ignored: no local payment for reference ${reference}`,
      );
      return { received: true };
    }

    if (status === 'complete' || status === 'completed' || status === 'succeeded') {
      await this.processSuccessfulPayment(payment.reference, {
        metadata: event,
        providerPaymentId:
          typeof transaction?.id === 'string' ? transaction.id : reference,
        providerSessionId: reference,
      });
    } else if (status === 'failed') {
      await this.updatePaymentStatus(payment.reference, BillingPaymentStatus.FAILED, {
        failureReason: 'Paiement Notch Pay échoué.',
        metadata: event,
        providerPaymentId:
          typeof transaction?.id === 'string' ? transaction.id : reference,
        providerSessionId: reference,
      });
    } else if (status === 'cancelled' || status === 'canceled') {
      await this.updatePaymentStatus(payment.reference, BillingPaymentStatus.CANCELED, {
        failureReason: 'Paiement Notch Pay annulé.',
        metadata: event,
        providerPaymentId:
          typeof transaction?.id === 'string' ? transaction.id : reference,
        providerSessionId: reference,
      });
    } else {
      await this.updatePaymentStatus(payment.reference, BillingPaymentStatus.PROCESSING, {
        metadata: event,
        providerPaymentId:
          typeof transaction?.id === 'string' ? transaction.id : reference,
        providerSessionId: reference,
      });
    }

    return { received: true };
  }

  private async createStripeCheckoutSession(
    reference: string,
    user: {
      email: string | null;
      id: string;
    },
    input: {
      amountInCents: number;
      durationMonths: BillingDuration;
      planKey: BillingPlanKey;
      tier: SubscriptionTier;
    },
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const checkoutUrl = `${this.getBackendUrl()}/billing/stripe/return`;
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append(
      'success_url',
      `${checkoutUrl}?reference=${reference}&session_id={CHECKOUT_SESSION_ID}`,
    );
    params.append(
      'cancel_url',
      `${checkoutUrl}?reference=${reference}&cancelled=1`,
    );
    params.append('client_reference_id', reference);
    params.append('customer_email', user.email || this.buildFallbackEmail(user.id));
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append(
      'line_items[0][price_data][unit_amount]',
      String(input.amountInCents),
    );
    params.append(
      'line_items[0][price_data][product_data][name]',
      `Souscription ${input.planKey === 'pro' ? 'Pro' : 'Business'}`,
    );
    params.append(
      'line_items[0][price_data][product_data][description]',
      `${input.durationMonths} mois - ${reference}`,
    );
    params.append('metadata[reference]', reference);
    params.append('metadata[userId]', user.id);
    params.append('metadata[planKey]', input.planKey);
    params.append('metadata[durationMonths]', String(input.durationMonths));
    params.append('metadata[tier]', input.tier);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = safeJsonParse<StripeCheckoutSession>(await response.text());

    if (!data.url) {
      throw new Error('Stripe checkout URL missing.');
    }

    return {
      checkoutUrl: data.url,
      metadata: data,
      providerPaymentId:
        typeof data.payment_intent === 'string' ? data.payment_intent : null,
      providerSessionId: data.id,
    };
  }

  private async fetchStripeCheckoutSession(sessionId: string) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return safeJsonParse<StripeCheckoutSession>(await response.text());
  }

  private async createNotchPayment(
    reference: string,
    user: {
      email: string | null;
      id: string;
    },
    input: {
      amountInXaf: number;
      phoneNumber: string | null;
    },
  ) {
    const apiKey = this.getNotchApiKey();

    if (!apiKey) {
      throw new Error('NOTCH_PUBLIC_KEY or NOTCH_PRIVATE_KEY is not configured');
    }

    const payload = {
      amount: input.amountInXaf,
      callback: `${this.getBackendUrl()}/billing/notchpay/return?reference=${reference}`,
      currency: 'XAF',
      description: `Souscription WhatsApp Agent - ${reference}`,
      email: user.email || this.buildFallbackEmail(user.id),
      locked_country: 'CM',
      phone: input.phoneNumber ? input.phoneNumber.replace('+', '') : undefined,
      reference,
    };

    const response = await fetch('https://api.notchpay.co/payments', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = safeJsonParse<NotchPaymentResponse>(await response.text());
    const checkoutUrl = data.authorization_url || data.payment_url;

    if (!checkoutUrl) {
      throw new Error('Notch Pay checkout URL missing.');
    }

    return {
      checkoutUrl,
      metadata: data,
      providerPaymentId:
        typeof data.transaction?.reference === 'string'
          ? data.transaction.reference
          : null,
      providerSessionId:
        typeof data.transaction?.reference === 'string'
          ? data.transaction.reference
          : null,
    };
  }

  private async verifyNotchPayment(reference: string) {
    const apiKey = this.getNotchApiKey();

    if (!apiKey) {
      throw new Error('NOTCH_PUBLIC_KEY or NOTCH_PRIVATE_KEY is not configured');
    }

    const response = await fetch(
      `https://api.notchpay.co/payments/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return safeJsonParse<NotchVerifyResponse>(await response.text());
  }

  private async verifyNotchPaymentByCandidates(references: Array<string | null | undefined>) {
    const candidates = Array.from(
      new Set(
        references
          .filter((value): value is string => Boolean(value && value.trim()))
          .map((value) => value.trim()),
      ),
    );

    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        const verification = await this.verifyNotchPayment(candidate);

        return {
          reference: candidate,
          verification,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Notch Pay verification failed');
  }

  private async processSuccessfulPayment(
    reference: string,
    details: {
      metadata?: unknown;
      providerPaymentId?: string | null;
      providerSessionId?: string | null;
    },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.billingPayment.findUnique({
          where: { reference },
          include: {
            creditGrant: true,
          },
        });

        if (!payment) {
          throw new NotFoundException('Paiement introuvable.');
        }

        if (payment.creditGrant) {
          return payment;
        }

        const subscription = await tx.subscription.findUnique({
          where: { userId: payment.userId },
        });
        const now = new Date();
        const shouldExtend =
          Boolean(subscription?.isActive) &&
          subscription?.tier === payment.subscriptionTier &&
          Boolean(subscription?.endDate && subscription.endDate > now);
        const startDate = shouldExtend ? subscription!.startDate : now;
        const endAnchor = shouldExtend ? subscription!.endDate : now;
        const monthlyCredits = getMonthlyCreditsForTier(payment.subscriptionTier);

        if (!monthlyCredits) {
          throw new InternalServerErrorException(
            'Configuration de souscription introuvable.',
          );
        }

        const creditsIncluded = shouldExtend && subscription
          ? subscription.creditsIncluded + payment.creditsAmount
          : payment.creditsAmount;
        const creditsUsed = shouldExtend && subscription
          ? subscription.creditsUsed
          : 0;

        await tx.credit.create({
          data: {
            amount: payment.creditsAmount,
            description: `Souscription ${payment.description} (${payment.reference})`,
            paymentId: payment.id,
            type: CreditType.PURCHASE,
            userId: payment.userId,
          },
        });

        await tx.user.update({
          where: { id: payment.userId },
          data: {
            credits: {
              increment: payment.creditsAmount,
            },
          },
        });

        await tx.subscription.upsert({
          where: { userId: payment.userId },
          update: {
            autoRenew: false,
            creditsIncluded,
            creditsUsed,
            endDate: addMonths(endAnchor, payment.durationMonths),
            isActive: true,
            startDate,
            tier: payment.subscriptionTier,
          },
          create: {
            autoRenew: false,
            creditsIncluded,
            creditsUsed,
            endDate: addMonths(endAnchor, payment.durationMonths),
            isActive: true,
            startDate,
            tier: payment.subscriptionTier,
            userId: payment.userId,
          },
        });

        return tx.billingPayment.update({
          where: { id: payment.id },
          data: {
            failedAt: null,
            failureReason: null,
            metadata: this.mergeMetadata(payment.metadata, details.metadata),
            processedAt: payment.processedAt || now,
            providerPaymentId:
              details.providerPaymentId || payment.providerPaymentId,
            providerSessionId:
              details.providerSessionId || payment.providerSessionId,
            status: BillingPaymentStatus.SUCCEEDED,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.billingPayment.findUnique({
          where: { reference },
        });
      }

      throw error;
    }
  }

  private async updatePaymentStatus(
    reference: string,
    status: BillingPaymentStatus,
    options: {
      failureReason?: string;
      metadata?: unknown;
      providerPaymentId?: string | null;
      providerSessionId?: string | null;
    } = {},
  ) {
    const payment = await this.prisma.billingPayment.findUnique({
      where: { reference },
    });

    if (!payment || payment.status === BillingPaymentStatus.SUCCEEDED) {
      return payment;
    }

    return this.prisma.billingPayment.update({
      where: { id: payment.id },
      data: {
        failedAt:
          status === BillingPaymentStatus.FAILED ||
          status === BillingPaymentStatus.CANCELED ||
          status === BillingPaymentStatus.EXPIRED
            ? payment.failedAt || new Date()
            : payment.failedAt,
        failureReason: options.failureReason || payment.failureReason,
        metadata: this.mergeMetadata(payment.metadata, options.metadata),
        providerPaymentId:
          options.providerPaymentId || payment.providerPaymentId,
        providerSessionId:
          options.providerSessionId || payment.providerSessionId,
        status,
      },
    });
  }

  private verifyStripeWebhookSignature(payload: string, signatureHeader: string) {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const items = signatureHeader.split(',').map((item) => item.trim());
    const timestamp = items
      .find((item) => item.startsWith('t='))
      ?.slice(2);
    const signatures = items
      .filter((item) => item.startsWith('v1='))
      .map((item) => item.slice(3))
      .filter(Boolean);

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expected = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const toleranceSeconds = 5 * 60;

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) {
      return false;
    }

    return signatures.some((candidate) => {
      try {
        const candidateBuffer = Buffer.from(candidate, 'hex');
        return (
          candidateBuffer.length === expectedBuffer.length &&
          timingSafeEqual(candidateBuffer, expectedBuffer)
        );
      } catch {
        return false;
      }
    });
  }

  private verifyNotchSignature(payload: string, signature: string) {
    const hashKey = this.configService.get<string>('NOTCH_HASH_KEY');

    if (!hashKey) {
      throw new Error('NOTCH_HASH_KEY is not configured');
    }

    const expected = createHmac('sha256', hashKey).update(payload).digest('hex');

    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const signatureBuffer = Buffer.from(signature, 'hex');

      return (
        signatureBuffer.length === expectedBuffer.length &&
        timingSafeEqual(signatureBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  }

  private resolvePhoneNumber(
    paymentMethod: BillingPaymentMethod,
    rawPhoneNumber?: string,
    userPhoneNumber?: string | null,
  ) {
    if (paymentMethod !== BillingPaymentMethod.MOBILE_MONEY) {
      return null;
    }

    const phoneNumber = rawPhoneNumber || userPhoneNumber || null;

    if (!phoneNumber) {
      throw new BadRequestException(
        'Un numéro Mobile Money au format international est requis.',
      );
    }

    if (!phoneNumber.startsWith('+237')) {
      throw new BadRequestException(
        'Le paiement Mobile Money est disponible uniquement au Cameroun.',
      );
    }

    return phoneNumber;
  }

  private getBackendUrl() {
    return (
      this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000'
    );
  }

  private getFrontendUrl() {
    const candidates = [
      this.configService.get<string>('FRONTEND_URL'),
      this.configService.get<string>('CORS_ORIGIN'),
      this.configService.get<string>('CORS_ORIGINS'),
      'http://localhost:5173',
    ];

    for (const candidate of candidates) {
      const normalized = this.resolveFrontendUrlCandidate(candidate);

      if (normalized) {
        return normalized;
      }
    }

    return 'http://localhost:5173';
  }

  buildFrontendRedirectUrl(
    payment: 'cancelled' | 'failed' | 'pending' | 'success',
    provider: BillingProvider,
    reference: string,
    reason?: string,
  ) {
    const appendSearchParams = (url: URL) => {
      url.searchParams.set('payment', payment);
      url.searchParams.set('provider', provider.toLowerCase());

      if (reference && reference !== 'unknown') {
        url.searchParams.set('reference', reference);
      }

      if (reason) {
        url.searchParams.set('reason', reason);
      }

      return url.toString();
    };

    try {
      return appendSearchParams(new URL('/pricing', this.getFrontendUrl()));
    } catch (error) {
      this.logger.error(
        'Failed to build frontend redirect URL, falling back to localhost frontend.',
        error instanceof Error ? error.stack : undefined,
      );

      return appendSearchParams(new URL('/pricing', 'http://localhost:5173'));
    }
  }

  private resolveFrontendUrlCandidate(rawValue?: string | null) {
    if (!rawValue) {
      return null;
    }

    const candidates = rawValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      try {
        return new URL(candidate).toString();
      } catch {
        continue;
      }
    }

    return null;
  }

  private async findNotchPaymentByAnyReference(reference: string) {
    if (!reference) {
      return null;
    }

    return this.prisma.billingPayment.findFirst({
      where: {
        provider: BillingProvider.NOTCH_PAY,
        OR: [
          { reference },
          { providerSessionId: reference },
          { providerPaymentId: reference },
        ],
      },
    });
  }

  private parseNotchReturnQuery(query: NotchReturnQuery) {
    const rawReferenceValues = this.normalizeQueryValues(query.reference);
    const fallbackReference =
      this.getFirstQueryValue(query.trxref) ||
      this.getFirstQueryValue(query.notchpay_trxref) ||
      '';
    const internalReference =
      rawReferenceValues[0] ||
      fallbackReference ||
      '';
    const providerReferences = rawReferenceValues.slice(1);

    return {
      internalReference,
      providerReferences,
      status: this.getFirstQueryValue(query.status)?.toLowerCase() || '',
    };
  }

  private normalizeQueryValues(value?: string | string[]) {
    const values = Array.isArray(value) ? value : value ? [value] : [];

    return values
      .flatMap((entry) =>
        entry
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      )
      .filter(Boolean);
  }

  private getFirstQueryValue(value?: string | string[]) {
    if (Array.isArray(value)) {
      return value[0]?.trim() || '';
    }

    return typeof value === 'string' ? value.trim() : '';
  }

  private getNotchApiKey() {
    return (
      this.configService.get<string>('NOTCH_PUBLIC_KEY') ||
      this.configService.get<string>('NOTCH_PRIVATE_KEY') ||
      null
    );
  }

  private buildFallbackEmail(userId: string) {
    return `payment-${userId}@whatsapp-agent.local`;
  }

  private generateReference() {
    return `wa_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  }

  private mergeMetadata(current: Prisma.JsonValue | null, next?: unknown) {
    if (typeof next === 'undefined') {
      return typeof current === 'undefined' || current === null
        ? undefined
        : (current as Prisma.InputJsonValue);
    }

    if (isRecord(current) && isRecord(next)) {
      return {
        ...current,
        ...next,
      } as Prisma.InputJsonObject;
    }

    if (next === null) {
      return Prisma.JsonNull;
    }

    return next as Prisma.InputJsonValue;
  }
}
