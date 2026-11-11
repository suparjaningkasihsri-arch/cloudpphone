'use client';

import Link from 'next/link';
import { AlertTriangle, Loader2, Play, Plus, RotateCw, Settings, Square, Trash2 } from 'lucide-react';
import type { Machine, Phone } from '@/lib/types';
import { caseColor, statusInfo } from '@/lib/status';
import { gb, timeAgo } from '@/lib/format';
import { Led } from './ui';

interface Props {
  machine: Machine;
  pending: Set<string>;
  onAddPhone: () => void;
  onSettings: () => void;
  onAction: (phone: Phone, action: 'start' | 'stop' | 'restart') => void;
  onDelete: (phone: Phone) => void;
}

function warnings(m: Machine): string[] {
  const out: string[] = [];
  if (!m.online) return out;
  if (m.info.docker === false) out.push('Docker belum berjalan di mesin ini.');
  if (m.info.binder === false)
    out.push('Kernel belum mendukung binder, HP tidak akan menyala. Lihat bagian pemecahan masalah di README.');
  if (m.info.adb === false) out.push('adb belum terpasang, layar tidak bisa dihubungkan.');
  if (!m.stream_url) out.push('Stream URL belum diisi. Buka pengaturan mesin untuk mengisinya.');
  return out;
}

export default function MachineShelf({ machine, pending, onAddPhone, onSettings, onAction, onDelete }: Props) {
  const { info } = machine;
  const used = info.mem_total_mb && info.mem_available_mb !== undefined ? info.mem_total_mb - info.mem_available_mb : null;
  const notes = warnings(machine);

  return (
    <section className="mt-14 first:mt-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Led tone={machine.online ? 'ok' : 'off'} />
            <h2 className="truncate font-display text-2xl font-semibold tracking-tight">{machine.name}</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {machine.online
              ? [
                  info.os,
                  used !== null ? `RAM terpakai ${gb(used)} dari ${gb(info.mem_total_mb)} GB` : null,
                  info.cpus ? `${info.cpus} inti` : null,
                ]
                  .filter(Boolean)
                  .join(', ')
              : `Offline, terakhir terlihat ${timeAgo(machine.last_seen)}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-quiet" onClick={onAddPhone}>
            <Plus size={16} /> HP baru
          </button>
          <button className="btn-icon" onClick={onSettings} aria-label={`Pengaturan ${machine.name}`}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {notes.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-start gap-2 text-sm text-warn">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      {machine.phones.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-medium">Rak ini masih kosong.</p>
          <p className="mt-1 text-sm text-muted">Buat HP pertama, lalu tunggu sekitar satu menit sampai menyala.</p>
          <button className="btn btn-primary mt-5" onClick={onAddPhone}>
            <Plus size={16} /> Buat HP
          </button>
        </div>
      ) : (
        <ul className="mt-7 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {machine.phones.map((phone, i) => (
            <li key={phone.id} className="animate-settle" style={{ animationDelay: `${i * 70}ms` }}>
              <PhoneTile
                phone={phone}
                machine={machine}
                disabled={pending.has(phone.id)}
                onAction={onAction}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PhoneTile({
  phone,
  machine,
  disabled,
  onAction,
  onDelete,
}: {
  phone: Phone;
  machine: Machine;
  disabled: boolean;
  onAction: Props['onAction'];
  onDelete: Props['onDelete'];
}) {
  const status = statusInfo(phone, machine);
  const busy = phone.busy_action !== null;
  const running = phone.status === 'running' && !busy;
  const canOpen = running && machine.online;
  const controls = disabled || busy || !machine.online;

  return (
    <div>
      {/* Casing HP berdiri di atas rak */}
      <div className="flex justify-center">
        <div
          className="w-[104px] rounded-[22px] p-[5px] shadow-[0_10px_18px_-10px_rgb(27_36_32/0.55)]"
          style={{ backgroundColor: caseColor(phone.id) }}
        >
          <div
            className="relative flex flex-col items-center justify-end overflow-hidden rounded-[17px] pb-3"
            style={{
              aspectRatio: `${phone.width} / ${phone.height}`,
              maxHeight: 190,
              background: running
                ? 'linear-gradient(165deg, #3b4bff 0%, #1d2380 55%, #0f1330 100%)'
                : '#141a17',
            }}
          >
            {busy ? (
              <Loader2 size={18} className="mb-auto mt-[40%] animate-spin text-white/70" />
            ) : (
              <span className="mb-auto mt-4 h-1 w-6 rounded-full bg-white/20" />
            )}
            <span className="text-[11px] font-medium text-white/80">Android {phone.android}</span>
          </div>
        </div>
      </div>
      <div className="mx-1 mt-0 h-1.5 rounded-full bg-line" />

      <div className="mt-3">
        <p className="truncate font-medium leading-tight">{phone.name}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-muted">
          {phone.width} × {phone.height}
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-[13px]">
          <Led tone={status.tone} />
          <span className={status.tone === 'bad' ? 'text-bad' : ''}>{status.label}</span>
        </p>
        {phone.error && !busy && <p className="mt-1 text-[12px] leading-snug text-bad">{phone.error}</p>}
      </div>

      <div className="mt-3 flex items-center gap-1">
        {canOpen ? (
          <Link href={`/phone/${phone.id}`} className="btn btn-primary px-4 py-1.5">
            Buka
          </Link>
        ) : (
          <span className="btn btn-primary pointer-events-none px-4 py-1.5 opacity-40" aria-disabled="true">
            Buka
          </span>
        )}
        {phone.status === 'running' ? (
          <button className="btn-icon" disabled={controls} onClick={() => onAction(phone, 'stop')} aria-label="Matikan">
            <Square size={16} />
          </button>
        ) : (
          <button className="btn-icon" disabled={controls} onClick={() => onAction(phone, 'start')} aria-label="Nyalakan">
            <Play size={16} />
          </button>
        )}
        <button className="btn-icon" disabled={controls} onClick={() => onAction(phone, 'restart')} aria-label="Mulai ulang">
          <RotateCw size={16} />
        </button>
        <button className="btn-icon" disabled={disabled} onClick={() => onDelete(phone)} aria-label="Hapus HP">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
