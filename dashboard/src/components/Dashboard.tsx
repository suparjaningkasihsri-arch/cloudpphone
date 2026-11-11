'use client';

import { useCallback, useRef, useState } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveState } from '@/lib/useLiveState';
import type { Phone } from '@/lib/types';
import { Logo } from './ui';
import MachineShelf from './MachineShelf';
import { AddMachineDialog, AddPhoneDialog, ConfirmDialog, MachineSettingsDialog } from './dialogs';

type Dialog =
  | { kind: 'addMachine' }
  | { kind: 'addPhone'; machineId: string }
  | { kind: 'settings'; machineId: string }
  | { kind: 'deletePhone'; machineId: string; phoneId: string };

export default function Dashboard() {
  const { state, error, refresh } = useLiveState(3000);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const noteTimer = useRef<ReturnType<typeof setTimeout>>();

  const closeDialog = useCallback(() => setDialog(null), []);
  const machines = state?.machines ?? [];

  function flash(message: string) {
    setNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 5000);
  }

  async function act(phone: Phone, action: 'start' | 'stop' | 'restart') {
    setPending((prev) => new Set(prev).add(phone.id));
    try {
      await api(`/api/phones/${phone.id}`, { method: 'POST', body: { action } });
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Perintah gagal dikirim');
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(phone.id);
        return next;
      });
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  const running = machines.reduce((n, m) => n + m.phones.filter((p) => p.status === 'running').length, 0);
  const online = machines.filter((m) => m.online).length;

  const dialogMachine = dialog && 'machineId' in dialog ? machines.find((m) => m.id === dialog.machineId) : undefined;
  const deletingPhone =
    dialog?.kind === 'deletePhone' ? dialogMachine?.phones.find((p) => p.id === dialog.phoneId) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-6 sm:px-8">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Cloudphone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-primary" onClick={() => setDialog({ kind: 'addMachine' })}>
            <Plus size={16} /> Tambah mesin
          </button>
          <button className="btn-icon" onClick={logout} aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {state === null ? (
        <div className="mt-16 space-y-6" aria-busy="true">
          <div className="h-12 w-2/3 animate-pulse rounded-xl bg-line/60" />
          <div className="h-48 animate-pulse rounded-2xl bg-line/40" />
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      ) : machines.length === 0 ? (
        <Onboarding onStart={() => setDialog({ kind: 'addMachine' })} />
      ) : (
        <>
          <header className="mt-14 max-w-2xl">
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              {running === 0 ? 'Belum ada HP yang menyala' : `${running} HP sedang menyala`}
            </h1>
            <p className="mt-3 text-muted">
              {online} dari {machines.length} mesin online.
              {error && <span className="text-bad"> Koneksi ke dashboard terputus, mencoba lagi…</span>}
            </p>
          </header>

          {machines.map((m) => (
            <MachineShelf
              key={m.id}
              machine={m}
              pending={pending}
              onAddPhone={() => setDialog({ kind: 'addPhone', machineId: m.id })}
              onSettings={() => setDialog({ kind: 'settings', machineId: m.id })}
              onAction={act}
              onDelete={(p) => setDialog({ kind: 'deletePhone', machineId: m.id, phoneId: p.id })}
            />
          ))}
        </>
      )}

      {dialog?.kind === 'addMachine' && <AddMachineDialog machines={machines} onClose={closeDialog} />}
      {dialog?.kind === 'addPhone' && dialogMachine && (
        <AddPhoneDialog machine={dialogMachine} onClose={closeDialog} onDone={refresh} />
      )}
      {dialog?.kind === 'settings' && dialogMachine && (
        <MachineSettingsDialog machine={dialogMachine} onClose={closeDialog} onChanged={refresh} />
      )}
      {dialog?.kind === 'deletePhone' && dialogMachine && deletingPhone && (
        <ConfirmDialog
          title={`Hapus ${deletingPhone.name}?`}
          body={
            dialogMachine.online
              ? 'HP dan seluruh datanya (aplikasi, akun, file) akan dihapus permanen dari mesin.'
              : 'Mesin sedang offline, jadi HP hanya dihapus dari daftar. Container-nya tetap ada di laptop dan perlu dihapus manual dengan docker rm.'
          }
          confirmLabel="Hapus HP"
          onClose={closeDialog}
          onConfirm={async () => {
            try {
              await api(`/api/phones/${deletingPhone.id}${dialogMachine.online ? '' : '?force=1'}`, {
                method: 'DELETE',
              });
              await refresh();
            } catch (e) {
              flash(e instanceof Error ? e.message : 'Gagal menghapus HP');
            }
          }}
        />
      )}

      {note && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-surface shadow-lg"
        >
          {note}
        </div>
      )}
    </div>
  );
}

function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <section className="mt-16 max-w-xl">
      <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
        Pasang laptopmu sebagai rak HP.
      </h1>
      <ol className="mt-8 space-y-4">
        {[
          ['Tambah mesin', 'Beri nama laptop Ubuntu yang akan menjalankan HP Android.'],
          ['Tempel satu perintah', 'Perintah dari dashboard memasang Docker, agent, dan layar browser di laptop.'],
          ['Buat HP', 'Pilih versi Android dan ukuran layar, lalu buka dari browser mana saja.'],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-medium text-surface">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <button className="btn btn-primary mt-9 px-6 py-2.5" onClick={onStart}>
        <Plus size={16} /> Tambah mesin pertama
      </button>
    </section>
  );
}
