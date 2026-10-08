import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="card auth-card">
        <h1>Not found</h1>
        <p className="muted">This page doesn’t exist, or you don’t have access to it.</p>
        <Link href="/" className="btn primary block">Go to start</Link>
      </div>
    </main>
  );
}
