create table if not exists manga (
  id text primary key,
  title text not null,
  cover_url text not null,
  synopsis text not null,
  genres jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,
  status text not null,
  source_count integer not null default 0,
  last_chapter_number text not null,
  updated_at timestamptz not null,
  alt_titles jsonb not null default '[]'::jsonb,
  authors jsonb not null default '[]'::jsonb,
  artists jsonb not null default '[]'::jsonb
);

create table if not exists chapter (
  id text not null,
  manga_id text not null references manga(id) on delete cascade,
  title text not null,
  number text not null,
  source_name text not null,
  source_chapter_url text not null,
  released_at timestamptz not null,
  primary key (manga_id, id)
);

create index if not exists chapter_manga_released_idx on chapter (manga_id, released_at desc);

create table if not exists user_library (
  user_id text not null,
  manga_id text not null references manga(id) on delete cascade,
  status text not null,
  last_read_chapter_id text null,
  last_read_at timestamptz null,
  notify_on_update boolean not null default true,
  added_at timestamptz not null,
  primary key (user_id, manga_id)
);

create table if not exists event_log (
  id bigserial primary key,
  user_id text not null,
  type text not null,
  manga_id text null,
  chapter_id text null,
  query text null,
  at timestamptz not null
);

create index if not exists event_log_user_at_idx on event_log (user_id, at desc);

create table if not exists ingest_run (
  id text primary key,
  source text not null,
  harvested_at timestamptz not null,
  manga_upserts integer not null,
  chapter_upserts integer not null,
  created_at timestamptz not null
);

create index if not exists ingest_run_created_idx on ingest_run (created_at desc);

create table if not exists source_manga_link (
  id text primary key,
  source text not null,
  source_manga_id text null,
  source_manga_url text null,
  source_title text null,
  manga_id text not null references manga(id) on delete cascade,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null
);

create unique index if not exists source_manga_link_source_id_uq
  on source_manga_link (source, source_manga_id)
  where source_manga_id is not null;

create unique index if not exists source_manga_link_source_url_uq
  on source_manga_link (source, source_manga_url)
  where source_manga_url is not null;

create index if not exists source_manga_link_manga_idx on source_manga_link (manga_id, last_seen_at desc);
