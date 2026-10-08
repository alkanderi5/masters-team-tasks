import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Used ONLY to create, disable or reset employee
 * login accounts. Never import this from a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Login accounts need SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
