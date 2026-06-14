create table if not exists ingest_error (
  id text primary key,
  source text not null,
  stage text not null,
  message text not null,
  details text null,
  retryable boolean not null default true,
  at timestamptz not null
);

create index if not exists ingest_error_at_idx on ingest_error (at desc);
create index if not exists ingest_error_source_at_idx on ingest_error (source, at desc);
