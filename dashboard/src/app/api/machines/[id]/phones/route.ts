import { ensureSchema, sql } from '@/lib/db';
import { bad, cleanName, intIn, json, readBody } from '@/lib/http';
import { randomHex } from '@/lib/ids';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ANDROIDS = ['11', '12', '13', '14'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();
  const mid = params.id;

  const machine = (await q`select id from machines where id = ${mid}`)[0];
  if (!machine) return bad('Mesin tidak ditemukan', 404);

  const count = (await q`select count(*)::int as n from phones where machine_id = ${mid}`)[0].n as number;
  if (count >= 20) return bad('Maksimal 20 HP per mesin');

  const body = await readBody(req);
  const name = cleanName(body.name, 30);
  const android = String(body.android ?? '');
  const width = intIn(body.width, 360, 2160);
  const height = intIn(body.height, 640, 3840);
  const dpi = intIn(body.dpi, 120, 640);

  if (!name) return bad('Isi nama HP (maksimal 30 karakter)');
  if (!ANDROIDS.includes(android)) return bad('Versi Android tidak didukung');
  if (width === null || height === null || dpi === null) return bad('Resolusi tidak valid');

  // Port dipilih otomatis; ulangi jika bentrok dengan permintaan lain.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const id = 'ph_' + randomHex(4);
      await q`insert into phones (id, machine_id, name, port, android, width, height, dpi)
              select ${id}::text, ${mid}::text, ${name}::text, coalesce(max(port), 5554) + 1,
                     ${android}::text, ${width}::int, ${height}::int, ${dpi}::int
              from phones where machine_id = ${mid}::text`;
      await q`insert into commands (machine_id, phone_id, action) values (${mid}, ${id}, 'create')`;
      return json({ id }, 201);
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  return bad('Gagal membuat HP', 500);
}
