import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import { userIdFromEvent } from './_shared/auth'

export interface CheckoutDeps {
  userId: string
  plan: 'monthly' | 'yearly'
  priceForPlan: { monthly: string; yearly: string }
  siteUrl: string
  findCustomerId: (userId: string) => Promise<string | null>
  createCustomer: (userId: string) => Promise<string>
  saveCustomer: (userId: string, customerId: string) => Promise<void>
  createSession: (args: {
    customer: string
    priceId: string
    userId: string
    successUrl: string
    cancelUrl: string
  }) => Promise<{ url: string | null }>
}

export async function buildCheckout(
  deps: CheckoutDeps,
): Promise<{ url: string | null }> {
  let customerId = await deps.findCustomerId(deps.userId)
  if (!customerId) {
    customerId = await deps.createCustomer(deps.userId)
    await deps.saveCustomer(deps.userId, customerId)
  }
  const priceId = deps.priceForPlan[deps.plan]
  return deps.createSession({
    customer: customerId,
    priceId,
    userId: deps.userId,
    successUrl: `${deps.siteUrl}/?checkout=success`,
    cancelUrl: `${deps.siteUrl}/?checkout=cancel`,
  })
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()

  const userId = await userIdFromEvent(
    { headers: event.headers },
    async (token) => {
      const { data } = await admin.auth.getUser(token)
      return data.user?.id ?? null
    },
  )
  if (!userId) {
    return json(401, { error: 'unauthorized' })
  }

  const plan =
    (JSON.parse(event.body ?? '{}').plan as 'monthly' | 'yearly') ?? 'monthly'
  const result = await buildCheckout({
    userId,
    plan,
    priceForPlan: {
      monthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
      yearly: process.env.STRIPE_PRICE_YEARLY ?? '',
    },
    siteUrl: process.env.URL ?? '',
    findCustomerId: async (uid) => {
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', uid)
        .maybeSingle()
      return data?.stripe_customer_id ?? null
    },
    createCustomer: async (uid) => {
      const customer = await stripe.customers.create({
        metadata: { user_id: uid },
      })
      return customer.id
    },
    saveCustomer: async (uid, customerId) => {
      await admin.from('subscriptions').upsert({
        user_id: uid,
        stripe_customer_id: customerId,
        status: 'incomplete',
      })
    },
    createSession: async (args) => {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: args.customer,
        line_items: [{ price: args.priceId, quantity: 1 }],
        client_reference_id: args.userId,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
      })
      return { url: session.url }
    },
  })
  return json(200, result)
}
