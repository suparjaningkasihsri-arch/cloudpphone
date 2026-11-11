import { NextResponse } from 'next/server';
import { COOKIE, checkPassword, cookieOptions, createSession, passwordConfigured } from '@/lib/auth';
import { ensureSchema, sql } from '@/lib/db';
import { bad, readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!passwordConfigured() || !process.env.SESSION_SECRET) {
    return bad('DASHBOARD_PASSWORD dan SESSION_SECRET belum diatur di Vercel', 500);
  }

  await ensureSchema();
  const q = sql();
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64);

  const recent = (
    await q`select count(*)::int as n from login_fails where ip = ${ip} and at > now() - interval '15 minutes'`
  )[0];
  if (recent.n >= 8) {
    return bad('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429);
  }

  const body = await readBody(req);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!(await checkPassword(password))) {
    await q`insert into login_fails (ip) values (${ip})`;
    await q`delete from login_fails where at < now() - interval '1 day'`;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return bad('Password salah', 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(), cookieOptions);
  return res;
}
