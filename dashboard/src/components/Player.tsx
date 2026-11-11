'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Maximize2, RotateCw, Square } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveState } from '@/lib/useLiveState';
import { caseColor, statusInfo } from '@/lib/status';
import { streamLinks } from '@/lib/stream';
import { Led } from './ui';

export default function Player({ id }: { id: string }) {
  const { state, refresh } = useLiveState(5000);
  const frameRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const found = useMemo(() => {
    for (const m of state?.machines ?? []) {
      const p = m.phones.find((x) => x.id === id);
      if (p) return { machine: m, phone: p };
    }
    return null;
  }, [state, id]);

  async function send(action: 'stop' | 'restart') {
    setError(null);
    try {
      await api(`/api/phones/${id}`, { method: 'POST', body: { action } });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Perintah gagal dikirim');
    }
  }

  const back = (
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-ink">
      <ArrowLeft size={16} /> Semua HP
    </Link>
  );

  if (state === null) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        {back}
        <div className="mt-10 h-[60vh] animate-pulse rounded-3xl bg-line/40" aria-busy="true" />
      </div>
    );
  }

  if (!found) {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        {back}
        <h1 className="mt-12 font-display text-3xl font-semibold tracking-tight">HP tidak ditemukan</h1>
        <p className="mt-2 text-muted">HP ini mungkin sudah dihapus. Kembali ke daftar untuk melihat HP yang ada.</p>
      </div>
    );
  }

  const { machine, phone } = found;
  const status = statusInfo(phone, machine);
  const links = streamLinks(machine.stream_url, phone);
  const showFrame = Boolean(links) && phone.status === 'running';

  let overlay: string | null = null;
  if (!machine.online) overlay = `${machine.name} sedang offline. Layar akan kembali saat mesin terhubung.`;
  else if (phone.busy_action) overlay = status.label;
  else if (phone.status !== 'running') overlay = `HP sedang ${status.label.toLowerCase()}. Nyalakan dulu dari daftar HP.`;
  else if (!links) overlay = 'Stream URL belum diisi. Buka pengaturan mesin di halaman utama untuk mengisinya.';

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8">
      {back}

      <div className="mt-6 grid gap-10 lg:grid-cols-[auto_1fr]">
        <div className="flex justify-center">
          <div
            ref={frameRef}
            className="relative rounded-[34px] p-2 shadow-[0_24px_40px_-24px_rgb(27_36_32/0.6)]"
            style={{
              backgroundColor: caseColor(phone.id),
              height: 'min(80vh, 880px)',
              aspectRatio: `${phone.width} / ${phone.height}`,
              maxWidth: '100%',
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[27px] bg-[#141a17]">
              {showFrame && links && (
                <iframe
                  key={reloadKey}
                  src={links.stream}
                  title={`Layar ${phone.name}`}
                  className="h-full w-full border-0 bg-black"
                  allow="fullscreen; clipboard-read; clipboard-write; autoplay"
                />
              )}
              {overlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#141a17]/90 p-8 text-center text-sm leading-relaxed text-white/80">
                  {overlay}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">{phone.name}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Led tone={status.tone} />
            {status.label}
          </p>

          <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
            {[
              ['Mesin', machine.name],
              ['Android', phone.android],
              ['Layar', `${phone.width} × ${phone.height}, ${phone.dpi} dpi`],
              ['Alamat adb', `127.0.0.1:${phone.port} (hanya di laptop)`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-quiet" disabled={!showFrame} onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCw size={15} /> Muat ulang layar
            </button>
            <button
              className="btn btn-quiet"
              disabled={!showFrame}
              onClick={() => frameRef.current?.requestFullscreen?.()}
            >
              <Maximize2 size={15} /> Layar penuh
            </button>
            {links && (
              <a className="btn btn-quiet" href={links.stream} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} /> Buka di tab baru
              </a>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <button className="btn btn-quiet" disabled={!machine.online || phone.busy_action !== null} onClick={() => send('restart')}>
              Mulai ulang HP
            </button>
            <button className="btn btn-danger" disabled={!machine.online || phone.busy_action !== null} onClick={() => send('stop')}>
              <Square size={14} /> Matikan
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}

          {links && (
            <p className="mt-8 text-[13px] leading-relaxed text-muted">
              Layar kosong atau tidak muncul? Buka di tab baru dan masuk lewat Cloudflare Access dulu, lalu muat
              ulang halaman ini. Jika masih gagal, pilih HP dari daftar perangkat di{' '}
              <a className="underline" href={links.list} target="_blank" rel="noopener noreferrer">
                {links.list.replace(/^https?:\/\//, '')}
              </a>
              .
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
