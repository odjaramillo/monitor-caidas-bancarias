-- Up Migration

-- The banks of the MVP. The id is the same text identifier as docs/api.md (issue #15).
create table banks (
  id text primary key,
  name text not null
);

-- One row per report a person sends. A bank to itself is a valid pair.
create table reports (
  id bigint generated always as identity primary key,
  origin text not null references banks (id),
  destination text not null references banks (id),
  type text not null check (type in ('no_sale', 'sale_no_llega', 'error_app', 'punto_de_venta')),
  created_at timestamptz not null default now()
);

-- The worker (#6, #21) counts the reports of the last 15 minutes on every pass.
create index reports_created_at_idx on reports (created_at);

-- Seed: the banks are a closed list, so they ship with the schema.
insert into banks (id, name) values
  ('venezuela', 'Banco de Venezuela'),
  ('banesco', 'Banesco'),
  ('mercantil', 'Mercantil'),
  ('provincial', 'BBVA Provincial'),
  ('bnc', 'Banco Nacional de Crédito'),
  ('bancamiga', 'Bancamiga'),
  ('bdt', 'Banco Digital de los Trabajadores'),
  ('bancaribe', 'Bancaribe'),
  ('exterior', 'Banco Exterior'),
  ('plaza', 'Banco Plaza');

-- Down Migration

drop table reports;
drop table banks;
