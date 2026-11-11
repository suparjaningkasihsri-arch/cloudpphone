import { ensureSchema, sql } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { isAuthed } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAuthed())) return bad('Belum login', 401);
  await ensureSchema();
  const q = sql();

  // Tandai dashboard sedang dibuka agar agent mengecek perintah lebih sering.
  await q`update app_state set ui_seen = now()
          where id = 1 and (ui_seen is null or ui_seen < now() - interval '15 seconds')`;

  const [machines, phones] = await Promise.all([
    q`select id, name, stream_url, hostname, info, last_seen, created_at,
             (last_seen is not null and last_seen > now() - interval '45 seconds') as online
      from machines order by created_at`,
    q`select p.id, p.machine_id, p.name, p.port, p.android, p.width, p.height, p.dpi,
             p.status, p.error, p.created_at,
             (select c.action from commands c
               where c.phone_id = p.id and c.status in ('pending', 'sent')
               order by c.id desc limit 1) as busy_action
      from phones p order by p.created_at`,
  ]);

  return json({
    machines: machines.map((m) => ({
      ...m,
      phones: phones.filter((p) => p.machine_id === m.id),
    })),
  });
}
