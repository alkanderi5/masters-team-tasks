import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="center-page">
      <div className="card auth-card">
        <div>
          <div className="sec">Team Tasks</div>
          <h1 style={{ marginTop: 8 }}>Sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
