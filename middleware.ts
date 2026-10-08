import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Name missing settings (never their values) instead of failing with a bare 500.
  // Static access only: Next.js inlines NEXT_PUBLIC_ values at build time.
  const missing = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  if (missing.length) {
    return new Response(`Server is not configured. Missing environment variables: ${missing.join(', ')}`, { status: 500 });
  }
  try {
    return await updateSession(request);
  } catch (err) {
    console.error('Middleware failed:', err);
    return new Response('Server error while checking the session. See the Vercel logs for details.', { status: 500 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
