import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/auth';
import { signOutAction } from '@/lib/actions';
import { BootstrapForm } from './BootstrapForm';

export const metadata: Metadata = { title: 'Account setup' };

export default async function SetupPage() {
  const me = await getMe();
  if (me) redirect('/');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: needsBootstrap } = await supabase.rpc('needs_bootstrap');

  return (
    <main className="center-page">
      <div className="card auth-card">
        {needsBootstrap ? (
          <>
            <div>
              <div className="sec">First-time setup</div>
              <h1 style={{ marginTop: 8 }}>Become the first manager</h1>
            </div>
            <p className="muted">
              No manager exists yet. Enter your name to set up {user.email} as the first manager. You can add the
              rest of the team afterwards.
            </p>
            <BootstrapForm />
          </>
        ) : (
          <>
            <h1>Account not linked</h1>
            <p className="muted">
              {user.email} is signed in but isn’t linked to an active employee. Ask a manager to add or reactivate
              you.
            </p>
          </>
        )}
        <form action={signOutAction}>
          <button className="btn block" type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
