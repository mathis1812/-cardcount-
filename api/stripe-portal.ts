import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import { userIdFromEvent } from './_shared/auth'

export const config = { runtime: 'nodejs' }

export interface PortalDeps {
  userId: string
  siteUrl: string
  findCustomerId: (userId: string) => Promise<string | null>
  createPortal: (args: { customer: string; returnUrl: string }) => Promise<{
    url: string | null
  }>
}

export async function buildPortal(
  deps: PortalDeps,
): Promise<{ url: string | null }> {
  const customerId = await deps.findCustomerId(deps.userId)
  if (!customerId) {
    return { url: null }
  }
  return deps.createPortal({
    customer: customerId,
    returnUrl: `${deps.siteUrl}/`,
  })
}

const json = (statusCode: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  })

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()
  const userId = await userIdFromEvent(
    { headers: Object.fromEntries(request.headers) },
    async (token) => {
      const { data } = await admin.auth.getUser(token)
      return data.user?.id ?? null
    },
  )
  if (!userId) {
    return json(401, { error: 'unauthorized' })
  }
  const result = await buildPortal({
    userId,
    siteUrl: process.env.SITE_URL ?? '',
    findCustomerId: async (uid) => {
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', uid)
        .maybeSingle()
      return data?.stripe_customer_id ?? null
    },
    createPortal: async (args) => {
      const session = await stripe.billingPortal.sessions.create({
        customer: args.customer,
        return_url: args.returnUrl,
      })
      return { url: session.url }
    },
  })
  return json(200, result)
}
