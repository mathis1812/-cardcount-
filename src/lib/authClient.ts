import { getSupabase } from './supabase'

export interface SignUpResult {
  readonly userId: string
  readonly needsConfirmation: boolean
}

export async function signUp(
  email: string,
  password: string,
): Promise<SignUpResult> {
  const { data, error } = await getSupabase().auth.signUp({ email, password })
  if (error) {
    throw new Error(error.message)
  }
  return {
    userId: data.user?.id ?? '',
    needsConfirmation: data.session === null,
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ userId: string }> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    throw new Error(error.message)
  }
  return { userId: data.user.id }
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

export function onAuthChange(cb: (userId: string | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null)
  })
  return () => data.subscription.unsubscribe()
}
