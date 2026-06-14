create table if not exists manga_alias (
  id text primary key,
  manga_id text not null references manga(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null
);

create unique index if not exists manga_alias_normalized_uq on manga_alias (normalized_alias);
create index if not exists manga_alias_manga_idx on manga_alias (manga_id, last_seen_at desc);
