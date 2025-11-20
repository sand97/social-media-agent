import {
  BusinessInfo,
  DeliveryLocation,
  PaymentMethod,
} from '@app/generated/client';
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateDeliveryLocationDto } from './dto/create-delivery-location.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get business information for a user
   */
  async getBusinessInfo(userId: string): Promise<BusinessInfo | null> {
    return this.prisma.businessInfo.findUnique({
      where: { user_id: userId },
    });
  }

  /**
   * Update business information for a user
   */
  async updateBusinessInfo(
    userId: string,
    data: UpdateBusinessInfoDto,
  ): Promise<BusinessInfo> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upsert business info (create if doesn't exist, update if it does)
    return this.prisma.businessInfo.upsert({
      where: { user_id: userId },
      create: {
        user: {
          connect: { id: userId },
        },
        ...data,
      },
      update: data,
    });
  }

  /**
   * Get all delivery locations for a user
   */
  async getDeliveryLocations(userId: string): Promise<DeliveryLocation[]> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.deliveryLocation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new delivery location for a user
   */
  async createDeliveryLocation(
    userId: string,
    data: CreateDeliveryLocationDto,
  ): Promise<DeliveryLocation> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.deliveryLocation.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  /**
   * Update a delivery location
   */
  async updateDeliveryLocation(
    locationId: string,
    userId: string,
    data: UpdateDeliveryLocationDto,
  ): Promise<DeliveryLocation> {
    // Verify the location belongs to the user
    const location = await this.prisma.deliveryLocation.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Delivery location not found');
    }

    if (location.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this delivery location',
      );
    }

    return this.prisma.deliveryLocation.update({
      where: { id: locationId },
      data,
    });
  }

  /**
   * Delete a delivery location
   */
  async deleteDeliveryLocation(
    locationId: string,
    userId: string,
  ): Promise<DeliveryLocation> {
    // Verify the location belongs to the user
    const location = await this.prisma.deliveryLocation.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Delivery location not found');
    }

    if (location.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this delivery location',
      );
    }

    return this.prisma.deliveryLocation.delete({
      where: { id: locationId },
    });
  }

  /**
   * Get all payment methods for a user
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new payment method for a user
   */
  async createPaymentMethod(
    userId: string,
    data: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.paymentMethod.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  /**
   * Update a payment method
   */
  async updatePaymentMethod(
    methodId: string,
    userId: string,
    data: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    // Verify the payment method belongs to the user
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id: methodId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    if (paymentMethod.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this payment method',
      );
    }

    return this.prisma.paymentMethod.update({
      where: { id: methodId },
      data,
    });
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(
    methodId: string,
    userId: string,
  ): Promise<PaymentMethod> {
    // Verify the payment method belongs to the user
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id: methodId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    if (paymentMethod.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this payment method',
      );
    }

    return this.prisma.paymentMethod.delete({
      where: { id: methodId },
    });
  }
}
