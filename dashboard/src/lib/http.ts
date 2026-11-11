import { NextResponse } from 'next/server';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const bad = (message: string, status = 400) => json({ error: message }, status);

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Nama bebas pengguna: dirapikan, tanpa karakter kontrol, dibatasi panjangnya.
export function cleanName(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return v.length >= 1 && v.length <= max ? v : null;
}

export function intIn(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
