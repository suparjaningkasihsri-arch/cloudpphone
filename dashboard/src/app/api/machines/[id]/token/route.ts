import { ensureSchema, sql } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { newToken, sha256hex } from '@/lib/ids';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Membuat token baru (misalnya untuk memasang ulang agent). Token lama langsung tidak berlaku.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const token = newToken();
  const rows = await sql()`update machines set token_hash = ${await sha256hex(token)}
                           where id = ${params.id} returning id`;
  if (rows.length === 0) return bad('Mesin tidak ditemukan', 404);
  return json({ token });
}
