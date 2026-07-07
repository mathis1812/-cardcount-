export type SubStatus =
  'incomplete' | 'active' | 'trialing' | 'past_due' | 'canceled'

const STATUS_MAP: Record<string, SubStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
  incomplete: 'incomplete',
}

export function mapStripeStatus(stripeStatus: string): SubStatus {
  return STATUS_MAP[stripeStatus] ?? 'incomplete'
}

export function planFromPriceId(
  priceId: string,
  monthlyId: string,
  yearlyId: string,
): 'monthly' | 'yearly' | null {
  if (priceId === monthlyId) {
    return 'monthly'
  }
  if (priceId === yearlyId) {
    return 'yearly'
  }
  return null
}
