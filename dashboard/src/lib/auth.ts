// Dipakai oleh middleware (Edge) dan route handler (Node): hanya Web Crypto.
const enc = new TextEncoder();

export const COOKIE = 'cp_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 hari

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET belum diatur (minimal 32 karakter)');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(value?: string | null): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  try {
    return safeEqual(await hmac(`${parts[0]}.${parts[1]}`), parts[2]);
  } catch {
    return false;
  }
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  // Bandingkan digest agar panjang password tidak bocor lewat waktu respons.
  const [a, b] = await Promise.all([hmac('pw:' + input), hmac('pw:' + expected)]);
  return safeEqual(a, b);
}
