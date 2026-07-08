import { getSupabase } from './supabase'

export class QuotaExceededError extends Error {
  constructor() {
    super('quota_exceeded')
    this.name = 'QuotaExceededError'
  }
}

export async function startDrillSession(): Promise<{
  remaining: number | null
}> {
  const { data, error } = await getSupabase().rpc(
    'start_drill_session',
    undefined,
  )
  if (error) {
    if (error.message.includes('quota_exceeded')) {
      throw new QuotaExceededError()
    }
    throw new Error(error.message)
  }
  return { remaining: (data as { remaining: number | null }).remaining }
}

export async function fetchSubscriptionStatus(): Promise<{
  isPremium: boolean
  plan: 'monthly' | 'yearly' | null
}> {
  const { data, error } = await getSupabase().rpc('get_subscription_status')
  if (error) {
    throw new Error(error.message)
  }
  const json = data as {
    is_premium: boolean
    plan: 'monthly' | 'yearly' | null
  }
  return { isPremium: json.is_premium, plan: json.plan }
}

async function postFunction(path: string, body?: unknown): Promise<string> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token ?? ''
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`function ${path} a échoué (${response.status})`)
  }
  const json = (await response.json()) as { url: string | null }
  if (!json.url) {
    throw new Error(`function ${path} : URL absente`)
  }
  return json.url
}

export function startCheckout(plan: 'monthly' | 'yearly'): Promise<string> {
  return postFunction('stripe-checkout', { plan })
}

export function openBillingPortal(): Promise<string> {
  return postFunction('stripe-portal')
}
