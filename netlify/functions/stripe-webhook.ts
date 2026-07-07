import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import {
  applyStripeEvent,
  type StripeEventLike,
  type SubscriptionRow,
  type UpsertDeps,
} from './_shared/subscriptionUpsert'

export interface WebhookDeps {
  verifySignature: (rawBody: string, signature: string) => StripeEventLike
  apply: (event: StripeEventLike) => Promise<{ handled: boolean }>
}

export async function processWebhook(
  rawBody: string,
  signature: string,
  deps: WebhookDeps,
): Promise<{ statusCode: number; body: string }> {
  let event: StripeEventLike
  try {
    event = deps.verifySignature(rawBody, signature)
  } catch {
    return { statusCode: 400, body: 'invalid signature' }
  }
  await deps.apply(event)
  return { statusCode: 200, body: 'ok' }
}

export const handler: Handler = async (event) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()
  const signature = event.headers['stripe-signature'] ?? ''

  const result = await processWebhook(event.body ?? '', signature, {
    verifySignature: (rawBody, sig) =>
      stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      ) as unknown as StripeEventLike,
    apply: (evt) => {
      const upsertDeps: UpsertDeps = {
        monthlyPriceId: process.env.STRIPE_PRICE_MONTHLY ?? '',
        yearlyPriceId: process.env.STRIPE_PRICE_YEARLY ?? '',
        upsertSubscription: async (row: SubscriptionRow) => {
          await admin
            .from('subscriptions')
            .update({
              stripe_sub_id: row.stripe_sub_id,
              status: row.status,
              plan: row.plan,
              current_period_end: row.current_period_end,
            })
            .eq('stripe_customer_id', row.stripe_customer_id)
        },
        markProcessed: async (eventId: string) => {
          const { error } = await admin
            .from('stripe_events')
            .insert({ id: eventId })
          return !error
        },
      }
      return applyStripeEvent(evt, upsertDeps)
    },
  })
  return { statusCode: result.statusCode, body: result.body }
}
