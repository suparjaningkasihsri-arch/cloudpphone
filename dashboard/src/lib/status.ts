import type { Machine, Phone, PhoneAction } from './types';

export type Tone = 'ok' | 'off' | 'warn' | 'bad';

const BUSY_LABEL: Record<PhoneAction, string> = {
  create: 'Membuat HP…',
  start: 'Menyalakan…',
  stop: 'Mematikan…',
  restart: 'Memulai ulang…',
  delete: 'Menghapus…',
};

export function statusInfo(phone: Phone, machine: Machine): { label: string; tone: Tone } {
  if (phone.busy_action) {
    const waiting = !machine.online ? ' (menunggu mesin online)' : '';
    return { label: BUSY_LABEL[phone.busy_action] + waiting, tone: 'warn' };
  }
  switch (phone.status) {
    case 'running':
      return machine.online
        ? { label: 'Menyala', tone: 'ok' }
        : { label: 'Mesin offline', tone: 'off' };
    case 'stopped':
      return { label: 'Mati', tone: 'off' };
    case 'restarting':
      return { label: 'Restart terus, cek modul binder', tone: 'bad' };
    case 'missing':
      return { label: 'Container hilang dari mesin', tone: 'bad' };
    case 'error':
      return { label: 'Gagal', tone: 'bad' };
    default:
      return { label: 'Menunggu agent', tone: 'warn' };
  }
}

// Setiap HP mendapat warna casing tetap berdasarkan id-nya.
const CASES = ['#f0b9a4', '#b4d2c0', '#c6c2ea', '#efd98f', '#a8cde4', '#e8b5cc'];

export function caseColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CASES[h % CASES.length];
}
