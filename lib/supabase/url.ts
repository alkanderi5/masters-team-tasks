/**
 * Project URL reduced to its origin. Tolerates values pasted with a path
 * (e.g. ".../rest/v1/") or a trailing slash, which Supabase rejects.
 */
export function supabaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}
