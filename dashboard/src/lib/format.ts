export function timeAgo(iso: string | null): string {
  if (!iso) return 'belum pernah terhubung';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export function gb(mb: number | undefined): string {
  if (!mb) return '0';
  return (mb / 1024).toFixed(1);
}
