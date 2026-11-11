import { ensureSchema, sql } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { sha256hex } from '@/lib/ids';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// Hanya field yang dikenal yang disimpan, dengan tipe yang sudah divalidasi.
function cleanInfo(v: any) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    agent: str(o.agent, 20),
    os: str(o.os, 80),
    kernel: str(o.kernel, 60),
    cpus: num(o.cpus),
    load1: num(o.load1),
    mem_total_mb: num(o.mem_total_mb),
    mem_available_mb: num(o.mem_available_mb),
    uptime_s: num(o.uptime_s),
    docker: typeof o.docker === 'string' ? o.docker.slice(0, 30) : false,
    binder: o.binder === true,
    adb: o.adb === true,
  };
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return bad('Token tidak ada', 401);

  await ensureSchema();
  const q = sql();

  const machine = (await q`select id from machines where token_hash = ${await sha256hex(token)}`)[0];
  if (!machine) return bad('Token tidak valid', 401);
  const mid = machine.id as string;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad('JSON tidak valid');
  }
  if (!body || typeof body !== 'object') return bad('Body tidak valid');

  await q`update machines
          set last_seen = now(), hostname = ${str(body.hostname, 100) ?? null},
              info = ${JSON.stringify(cleanInfo(body.info))}::jsonb
          where id = ${mid}`;

  // 1. Hasil perintah yang sudah dikerjakan agent.
  const results: any[] = Array.isArray(body.results) ? body.results.slice(0, 50) : [];
  for (const r of results) {
    const cid = Number(r?.command_id);
    if (!Number.isInteger(cid)) continue;
    const ok = r.ok === true;
    const err = ok ? null : (str(r.error, 500) ?? 'Gagal');
    const cmd = (
      await q`update commands set status = ${ok ? 'done' : 'error'}, error = ${err}
              where id = ${cid} and machine_id = ${mid} and status = 'sent'
              returning action, phone_id`
    )[0];
    if (!cmd) continue;
    if (cmd.action === 'delete' && ok) {
      await q`delete from phones where id = ${cmd.phone_id} and machine_id = ${mid}`;
    } else if (!ok && cmd.phone_id) {
      await q`update phones set status = 'error', error = ${err} where id = ${cmd.phone_id}`;
    }
  }

  // 2. Perintah yang terlalu lama tidak dijawab dianggap gagal.
  await q`with t as (
            update commands set status = 'error', error = 'Melewati batas waktu'
            where machine_id = ${mid} and status = 'sent' and sent_at < now() - interval '15 minutes'
            returning phone_id, action
          )
          update phones set status = 'error', error = 'Pembuatan HP melewati batas waktu'
          where id in (select phone_id from t where action = 'create')`;

  // 3. Samakan status HP dengan kenyataan di mesin.
  if (Array.isArray(body.phones)) {
    const reported = new Map<string, string>();
    for (const p of body.phones.slice(0, 100)) {
      if (p && typeof p.id === 'string' && ['running', 'stopped', 'restarting'].includes(p.status)) {
        reported.set(p.id, p.status);
      }
    }
    const rows = await q`select p.id, p.status,
                                exists (select 1 from commands c
                                        where c.phone_id = p.id and c.status in ('pending', 'sent')) as busy
                         from phones p where p.machine_id = ${mid}`;
    for (const row of rows) {
      if (row.busy) continue;
      const seen = reported.get(row.id as string);
      let next: string | null = null;
      if (seen) next = seen;
      else if (['running', 'stopped', 'restarting'].includes(row.status as string)) next = 'missing';
      if (next && next !== row.status) {
        await q`update phones
                set status = ${next},
                    error = ${next === 'missing' ? 'Container tidak ditemukan di mesin' : null}
                where id = ${row.id}`;
      }
    }
  }

  // 4. Ambil perintah baru dan tandai sudah dikirim.
  const claimed = await q`update commands set status = 'sent', sent_at = now()
                          where id in (select id from commands
                                       where machine_id = ${mid} and status = 'pending'
                                       order by id limit 10)
                          returning id, action, phone_id`;
  claimed.sort((a, b) => Number(a.id) - Number(b.id));

  let commands: any[] = [];
  if (claimed.length > 0) {
    const phoneRows = await q`select id, name, port, android, width, height, dpi
                              from phones where machine_id = ${mid}`;
    const byId = new Map<string, (typeof phoneRows)[number]>();
    for (const p of phoneRows) byId.set(p.id as string, p);
    commands = claimed
      .map((c) => ({ id: Number(c.id), action: c.action, phone: byId.get(c.phone_id as string) ?? null }))
      .filter((c) => c.phone);
  }

  // 5. Petunjuk interval polling: cepat saat dashboard dibuka atau ada perintah aktif.
  const ui = (
    await q`select (ui_seen is not null and ui_seen > now() - interval '45 seconds') as active
            from app_state where id = 1`
  )[0];
  const active = (
    await q`select count(*)::int as n from commands
            where machine_id = ${mid} and status in ('pending', 'sent')`
  )[0].n as number;

  return json({ commands, poll_ms: ui?.active || active > 0 ? 2000 : 15000 });
}
