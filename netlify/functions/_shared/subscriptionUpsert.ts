import {
  mapStripeStatus,
  planFromPriceId,
  type SubStatus,
} from './stripeStatus'

export interface StripeEventLike {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export interface SubscriptionRow {
  stripe_customer_id: string
  stripe_sub_id: string | null
  status: SubStatus
  plan: 'monthly' | 'yearly' | null
  current_period_end: string | null
}

export interface UpsertDeps {
  monthlyPriceId: string
  yearlyPriceId: string
  upsertSubscription: (row: SubscriptionRow) => Promise<void>
  markProcessed: (eventId: string) => Promise<boolean>
}

const HANDLED_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export async function applyStripeEvent(
  event: StripeEventLike,
  deps: UpsertDeps,
): Promise<{ handled: boolean }> {
  const fresh = await deps.markProcessed(event.id)
  if (!fresh) {
    return { handled: false }
  }
  if (
    !HANDLED_TYPES.has(event.type) ||
    event.type === 'checkout.session.completed'
  ) {
    // checkout.session.completed ne porte pas l'objet subscription complet :
    // on s'appuie sur customer.subscription.* pour l'état. Rien à écrire ici.
    return { handled: true }
  }
  const obj = event.data.object
  const priceId =
    (obj.items as { data?: { price?: { id?: string } }[] } | undefined)
      ?.data?.[0]?.price?.id ?? ''
  const periodEnd = obj.current_period_end as number | undefined
  await deps.upsertSubscription({
    stripe_customer_id: String(obj.customer),
    stripe_sub_id: (obj.id as string) ?? null,
    status: mapStripeStatus(String(obj.status)),
    plan: planFromPriceId(priceId, deps.monthlyPriceId, deps.yearlyPriceId),
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
  })
  return { handled: true }
}
