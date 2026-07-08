export async function userIdFromEvent(
  event: { headers: Record<string, string | undefined> },
  verify: (token: string) => Promise<string | null>,
): Promise<string | null> {
  const header = event.headers.authorization ?? event.headers.Authorization
  if (!header || !header.startsWith('Bearer ')) {
    return null
  }
  const token = header.slice('Bearer '.length)
  return verify(token)
}
