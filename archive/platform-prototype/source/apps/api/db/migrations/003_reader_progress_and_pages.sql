alter table if exists user_library
  add column if not exists last_read_page integer null;

create table if not exists chapter_page_cache (
  id text primary key,
  source text not null,
  source_name text not null,
  source_chapter_url text not null,
  manga_id text null references manga(id) on delete set null,
  chapter_id text null,
  pages jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null
);

create unique index if not exists chapter_page_cache_source_chapter_uq
  on chapter_page_cache (source_name, source_chapter_url);

create index if not exists chapter_page_cache_last_seen_idx
  on chapter_page_cache (last_seen_at desc);
