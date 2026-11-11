'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ANDROID_VERSIONS, RESOLUTIONS, type Machine } from '@/lib/types';
import { CopyBox, Field, Led, Modal } from './ui';

function installCommand(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `curl -fsSL ${origin}/agent/install.sh | sudo bash -s -- --server ${origin} --token ${token}`;
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/* ---------- Tambah mesin ---------- */

export function AddMachineDialog({ machines, onClose }: { machines: Machine[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);

  const live = created ? machines.find((m) => m.id === created.id) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; token: string }>('/api/machines', {
        method: 'POST',
        body: { name },
      });
      setCreated(res);
    } catch (err) {
      setError(errText(err, 'Gagal menambah mesin'));
    } finally {
      setBusy(false);
    }
  }

  if (!created) {
    return (
      <Modal title="Tambah mesin" onClose={onClose}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">
            Mesin adalah laptop atau server Ubuntu yang akan menjalankan HP Android.
          </p>
          <Field label="Nama mesin" hint="Contoh: Laptop rumah, atau Server kantor.">
            <input className="input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || name.trim() === ''}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Lanjut
          </button>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title="Pasang agent di mesin" onClose={onClose} wide>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Buka terminal di laptop Ubuntu yang akan dipakai.</li>
          <li>Tempel perintah di bawah, lalu tekan Enter. Instalasi memakan waktu beberapa menit.</li>
          <li>Halaman ini akan memberi tahu saat mesin terhubung.</li>
        </ol>
        <CopyBox text={installCommand(created.token)} />
        <p className="text-[13px] leading-snug text-muted">
          Token ini hanya tampil sekali. Jika hilang, buka pengaturan mesin dan buat token baru.
        </p>
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            live?.online ? 'border-ok/40 bg-ok/10' : 'border-line bg-surface-2'
          }`}
          aria-live="polite"
        >
          {live?.online ? (
            <>
              <Check size={16} className="text-ok" />
              <span>Mesin terhubung. Kamu sudah bisa membuat HP.</span>
            </>
          ) : (
            <>
              <Loader2 size={16} className="animate-spin text-muted" />
              <span>Menunggu mesin terhubung…</span>
            </>
          )}
        </div>
        <button className="btn btn-quiet w-full" onClick={onClose}>
          {live?.online ? 'Selesai' : 'Tutup, saya lanjutkan nanti'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- HP baru ---------- */

export function AddPhoneDialog({
  machine,
  onClose,
  onDone,
}: {
  machine: Machine;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(`HP ${machine.phones.length + 1}`);
  const [android, setAndroid] = useState<string>('13');
  const [resId, setResId] = useState<string>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = RESOLUTIONS.find((r) => r.id === resId) ?? RESOLUTIONS[1];
    setBusy(true);
    setError(null);
    try {
      await api(`/api/machines/${machine.id}/phones`, {
        method: 'POST',
        body: { name, android, width: res.width, height: res.height, dpi: res.dpi },
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errText(err, 'Gagal membuat HP'));
      setBusy(false);
    }
  }

  const choice = (active: boolean) =>
    `rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
      active ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-surface-2'
    }`;

  return (
    <Modal title={`HP baru di ${machine.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Nama HP">
          <input className="input" autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Versi Android</legend>
          <div className="flex flex-wrap gap-2">
            {ANDROID_VERSIONS.map((v) => (
              <button
                type="button"
                key={v}
                className={choice(android === v)}
                aria-pressed={android === v}
                onClick={() => setAndroid(v)}
              >
                Android {v}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Ukuran layar</legend>
          <div className="grid grid-cols-2 gap-2">
            {RESOLUTIONS.map((r) => (
              <button
                type="button"
                key={r.id}
                className={choice(resId === r.id)}
                aria-pressed={resId === r.id}
                onClick={() => setResId(r.id)}
              >
                <span className="block font-medium">{r.label}</span>
                <span className="block text-[13px] tabular-nums text-muted">{r.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted">Layar lebih besar butuh RAM sekitar 1 sampai 2 GB per HP.</p>
        </fieldset>

        {!machine.online && (
          <p className="text-sm text-warn">Mesin sedang offline. HP dibuat begitu mesin terhubung lagi.</p>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || name.trim() === ''}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          Buat HP
        </button>
      </form>
    </Modal>
  );
}

/* ---------- Pengaturan mesin ---------- */

export function MachineSettingsDialog({
  machine,
  onClose,
  onChanged,
}: {
  machine: Machine;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(machine.name);
  const [streamUrl, setStreamUrl] = useState(machine.stream_url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/api/machines/${machine.id}`, { method: 'PATCH', body: { name, stream_url: streamUrl } });
      onChanged();
      setSaved(true);
    } catch (err) {
      setError(errText(err, 'Gagal menyimpan'));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setError(null);
    try {
      const res = await api<{ token: string }>(`/api/machines/${machine.id}/token`, { method: 'POST' });
      setNewToken(res.token);
    } catch (err) {
      setError(errText(err, 'Gagal membuat token'));
    }
  }

  async function remove() {
    try {
      await api(`/api/machines/${machine.id}`, { method: 'DELETE' });
      onChanged();
      onClose();
    } catch (err) {
      setError(errText(err, 'Gagal menghapus mesin'));
    }
  }

  return (
    <Modal title="Pengaturan mesin" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Nama mesin">
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Stream URL"
          hint="Alamat HTTPS tempat layar HP ditampilkan (ws-scrcpy lewat Cloudflare Tunnel). Contoh: https://hp1.domainmu.com"
        >
          <input
            className="input"
            inputMode="url"
            placeholder="https://hp1.domainmu.com"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy || name.trim() === ''}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Simpan
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-ok" aria-live="polite">
              <Led tone="ok" /> Tersimpan
            </span>
          )}
        </div>
      </form>

      <div className="mt-8 space-y-3 border-t border-line pt-6">
        <h3 className="font-medium">Pasang ulang agent</h3>
        <p className="text-sm text-muted">
          Buat token baru jika kamu menginstal ulang laptop. Token lama langsung berhenti bekerja.
        </p>
        {newToken ? (
          <CopyBox text={installCommand(newToken)} />
        ) : (
          <button className="btn btn-quiet" onClick={regenerate}>
            Buat token baru
          </button>
        )}
      </div>

      <div className="mt-8 space-y-3 border-t border-line pt-6">
        <h3 className="font-medium">Hapus mesin</h3>
        <p className="text-sm text-muted">
          Mesin dan semua HP-nya dihapus dari dashboard. Container yang sudah berjalan di laptop tidak ikut
          terhapus. Hapus HP satu per satu dulu jika ingin membersihkannya.
        </p>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button className="btn btn-danger" onClick={remove}>
              Ya, hapus mesin
            </button>
            <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
              Batal
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Hapus mesin
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Konfirmasi ---------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex gap-2">
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            onClose();
          }}
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {confirmLabel}
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Batal
        </button>
      </div>
    </Modal>
  );
}
