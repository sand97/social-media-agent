type LooseRecord = Record<string, unknown>

export type PlanKey = 'free' | 'pro' | 'business'

const PLAN_LABELS: Record<PlanKey, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null
}

function getNestedValue(record: LooseRecord | undefined, key: string) {
  return record?.[key]
}

function normalizePlanValue(value: string): PlanKey {
  const normalized = value.trim().toLowerCase()

  if (
    normalized.includes('scale') ||
    normalized.includes('enterprise') ||
    normalized.includes('business')
  ) {
    return 'business'
  }

  if (
    normalized.includes('pro') ||
    normalized.includes('premium') ||
    normalized.includes('growth')
  ) {
    return 'pro'
  }

  return 'free'
}

export function resolveCurrentPlanKey(user: unknown): PlanKey {
  const record = isRecord(user) ? user : undefined
  const subscription = isRecord(getNestedValue(record, 'subscription'))
    ? (getNestedValue(record, 'subscription') as LooseRecord)
    : undefined
  const billing = isRecord(getNestedValue(record, 'billing'))
    ? (getNestedValue(record, 'billing') as LooseRecord)
    : undefined

  const candidates = [
    getNestedValue(record, 'plan'),
    getNestedValue(record, 'subscriptionPlan'),
    getNestedValue(record, 'currentPlan'),
    getNestedValue(subscription, 'plan'),
    getNestedValue(subscription, 'tier'),
    getNestedValue(billing, 'plan'),
    getNestedValue(billing, 'tier'),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return normalizePlanValue(candidate)
    }
  }

  return 'free'
}

export function getPlanLabel(plan: PlanKey) {
  return PLAN_LABELS[plan]
}
