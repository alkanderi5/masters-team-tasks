'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStatusAction } from '@/lib/actions';

export function BlockedResume({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setStatusAction(taskId, 'in_progress');
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        Resume → In progress
      </button>
      {error && <div className="form-error" role="alert" style={{ flexBasis: '100%' }}>{error}</div>}
    </>
  );
}
