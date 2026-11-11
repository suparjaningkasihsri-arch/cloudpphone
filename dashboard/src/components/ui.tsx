'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { Tone } from '@/lib/status';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="rgb(47 59 255)" />
      <rect x="10" y="6" width="12" height="20" rx="3.5" stroke="#fff" strokeWidth="2.2" />
      <circle cx="16" cy="21.8" r="1.4" fill="#fff" />
    </svg>
  );
}

export function Led({ tone }: { tone: Tone }) {
  const color =
    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-muted/40';
  const glow = tone === 'ok' ? 'shadow-[0_0_0_3px_rgb(var(--ok)/0.18)]' : '';
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${glow}`} />;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between px-6 pb-1 pt-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}

export function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard tidak tersedia */
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-ink p-3.5 text-surface">
      <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed">{text}</code>
      <button
        className="shrink-0 rounded-full p-1.5 text-surface/70 transition hover:bg-white/10 hover:text-white"
        onClick={copy}
        aria-label={copied ? 'Tersalin' : 'Salin perintah'}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}
