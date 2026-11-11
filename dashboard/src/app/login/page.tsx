'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Tidak bisa masuk');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak bisa masuk');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <Logo size={34} />
        <span className="font-display text-2xl font-semibold tracking-tight">Cloudphone</span>
      </div>
      <h1 className="mt-10 font-display text-4xl font-semibold leading-tight tracking-tight">
        HP kamu menunggu di rak.
      </h1>
      <p className="mt-3 text-muted">Masukkan password dashboard untuk membukanya.</p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full py-2.5" disabled={busy || password.length === 0}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          Masuk
        </button>
      </form>
    </main>
  );
}
