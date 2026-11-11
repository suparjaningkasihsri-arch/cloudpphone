// Membuat tautan ke ws-scrcpy untuk satu HP.
// Format hash mengikuti tautan yang dibuat ws-scrcpy sendiri (action=stream, player=mse).
export function streamLinks(
  base: string | null,
  phone: { port: number },
): { stream: string; list: string } | null {
  if (!base) return null;
  const root = base.replace(/\/+$/, '');
  const udid = `127.0.0.1:${phone.port}`;
  const wsBase = root.replace(/^http/i, 'ws');
  const proxy =
    `${wsBase}/?action=proxy-adb&remote=${encodeURIComponent('tcp:8886')}` +
    `&udid=${encodeURIComponent(udid)}`;
  const hash =
    `#!action=stream&udid=${encodeURIComponent(udid)}&player=mse` +
    `&ws=${encodeURIComponent(proxy)}`;
  return { stream: `${root}/${hash}`, list: root };
}
