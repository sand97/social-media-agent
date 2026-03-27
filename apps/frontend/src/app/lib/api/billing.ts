import apiClient from './client'

export type BillingPlanKey = 'pro' | 'business'
export type BillingDuration = 1 | 6 | 12
export type BillingPaymentMethod = 'CARD' | 'MOBILE_MONEY'
export type BillingProvider = 'STRIPE' | 'NOTCH_PAY'

export interface CreateCheckoutPayload {
  planKey: BillingPlanKey
  durationMonths: BillingDuration
  paymentMethod: BillingPaymentMethod
  phoneNumber?: string
}

export interface CreateCheckoutResponse {
  amount: number
  checkoutUrl: string
  currency: string
  paymentMethod: BillingPaymentMethod
  provider: BillingProvider
  reference: string
}

export async function createCheckoutSession(
  payload: CreateCheckoutPayload
): Promise<CreateCheckoutResponse> {
  const response = await apiClient.post<CreateCheckoutResponse>(
    '/billing/checkout',
    payload
  )

  return response.data
}
