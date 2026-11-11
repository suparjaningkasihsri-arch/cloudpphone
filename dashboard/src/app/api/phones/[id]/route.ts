import { ensureSchema, sql } from '@/lib/db';
import { bad, json, readBody } from '@/lib/http';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ACTIONS = ['start', 'stop', 'restart'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();

  const body = await readBody(req);
  const action = String(body.action ?? '');
  if (!ACTIONS.includes(action)) return bad('Aksi tidak dikenal');

  const phone = (await q`select id, machine_id from phones where id = ${params.id}`)[0];
  if (!phone) return bad('HP tidak ditemukan', 404);

  const busy = (
    await q`select 1 as x from commands where phone_id = ${params.id} and status in ('pending', 'sent') limit 1`
  )[0];
  if (busy) return bad('HP ini masih memproses perintah sebelumnya', 409);

  await q`insert into commands (machine_id, phone_id, action)
          values (${phone.machine_id}, ${params.id}, ${action})`;
  return json({ ok: true }, 201);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();

  const phone = (await q`select id, machine_id from phones where id = ${params.id}`)[0];
  if (!phone) return bad('HP tidak ditemukan', 404);

  // force=1: hapus dari daftar saja (dipakai saat mesin offline). Container di mesin tidak disentuh.
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (force) {
    await q`delete from phones where id = ${params.id}`;
    return json({ ok: true });
  }

  const already = (
    await q`select 1 as x from commands where phone_id = ${params.id} and action = 'delete'
            and status in ('pending', 'sent') limit 1`
  )[0];
  if (!already) {
    await q`insert into commands (machine_id, phone_id, action)
            values (${phone.machine_id}, ${params.id}, 'delete')`;
  }
  return json({ ok: true });
}
