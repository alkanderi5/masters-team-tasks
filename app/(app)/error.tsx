'use client';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card pad" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      <p className="muted" style={{ marginBottom: 14 }}>
        {error.message || 'The page could not be loaded.'}
      </p>
      <button type="button" className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
