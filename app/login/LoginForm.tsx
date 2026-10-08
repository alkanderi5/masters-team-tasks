'use client';

import { useActionState } from 'react';
import { signInAction } from '@/lib/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state && !state.ok && <div className="form-error" role="alert">{state.error}</div>}
      <button className="btn primary block" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
