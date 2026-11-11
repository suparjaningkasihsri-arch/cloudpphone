import { ensureSchema, sql } from '@/lib/db';
import { bad, cleanName, json, readBody } from '@/lib/http';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();

  const exists = (await q`select id from machines where id = ${params.id}`)[0];
  if (!exists) return bad('Mesin tidak ditemukan', 404);

  const body = await readBody(req);

  if ('name' in body) {
    const name = cleanName(body.name, 40);
    if (!name) return bad('Nama mesin tidak valid');
    await q`update machines set name = ${name} where id = ${params.id}`;
  }

  if ('stream_url' in body) {
    const raw = typeof body.stream_url === 'string' ? body.stream_url.trim() : '';
    if (raw === '') {
      await q`update machines set stream_url = null where id = ${params.id}`;
    } else {
      let origin: string;
      try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
        origin = u.origin;
      } catch {
        return bad('Stream URL harus berupa alamat http(s) yang valid');
      }
      await q`update machines set stream_url = ${origin} where id = ${params.id}`;
    }
  }

  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  await sql()`delete from machines where id = ${params.id}`;
  return json({ ok: true });
}
