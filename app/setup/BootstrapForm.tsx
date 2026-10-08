'use client';

import { useActionState } from 'react';
import { bootstrapAction } from '@/lib/actions';

export function BootstrapForm() {
  const [state, action, pending] = useActionState(bootstrapAction, null);
  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" required maxLength={80} autoFocus />
      </div>
      {state && !state.ok && <div className="form-error" role="alert">{state.error}</div>}
      <button className="btn primary block" type="submit" disabled={pending}>
        {pending ? 'Setting up…' : 'Continue'}
      </button>
    </form>
  );
}
