import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL belum diatur');
    client = neon(url);
  }
  return client;
}

let ready: Promise<void> | null = null;

// Membuat tabel jika belum ada. Dijalankan sekali per instance serverless.
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const q = sql();
      await q`create table if not exists machines (
        id text primary key,
        name text not null,
        token_hash text not null unique,
        stream_url text,
        hostname text,
        info jsonb not null default '{}'::jsonb,
        last_seen timestamptz,
        created_at timestamptz not null default now()
      )`;
      await q`create table if not exists phones (
        id text primary key,
        machine_id text not null references machines(id) on delete cascade,
        name text not null,
        port integer not null,
        android text not null,
        width integer not null,
        height integer not null,
        dpi integer not null,
        status text not null default 'pending',
        error text,
        created_at timestamptz not null default now(),
        unique (machine_id, port)
      )`;
      await q`create table if not exists commands (
        id bigserial primary key,
        machine_id text not null references machines(id) on delete cascade,
        phone_id text references phones(id) on delete cascade,
        action text not null,
        status text not null default 'pending',
        error text,
        created_at timestamptz not null default now(),
        sent_at timestamptz
      )`;
      await q`create index if not exists commands_queue_idx on commands (machine_id, status)`;
      await q`create table if not exists app_state (id integer primary key, ui_seen timestamptz)`;
      await q`insert into app_state (id) values (1) on conflict do nothing`;
      await q`create table if not exists login_fails (
        ip text not null,
        at timestamptz not null default now()
      )`;
      await q`create index if not exists login_fails_idx on login_fails (ip, at)`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
