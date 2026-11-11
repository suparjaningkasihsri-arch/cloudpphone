import { ensureSchema, sql } from '@/lib/db';
import { bad, cleanName, json, readBody } from '@/lib/http';
import { newToken, randomHex, sha256hex } from '@/lib/ids';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();

  const body = await readBody(req);
  const name = cleanName(body.name, 40);
  if (!name) return bad('Isi nama mesin (maksimal 40 karakter)');

  const count = (await q`select count(*)::int as n from machines`)[0].n as number;
  if (count >= 10) return bad('Maksimal 10 mesin');

  const id = 'mc_' + randomHex(4);
  const token = newToken();
  await q`insert into machines (id, name, token_hash) values (${id}, ${name}, ${await sha256hex(token)})`;

  // Token hanya ditampilkan sekali ini; yang tersimpan hanya hash-nya.
  return json({ id, name, token }, 201);
}
