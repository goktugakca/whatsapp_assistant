-- Veritabanı şeması. Tekrar tekrar çalıştırılabilir (npm run db:migrate).

-- Randevu çakışmasını veritabanı seviyesinde engellemek için (EXCLUDE ... WITH &&).
create extension if not exists btree_gist;

create table if not exists conversations (
  id uuid primary key,
  business_id text not null,
  channel text not null,
  contact text not null,
  contact_name text,
  status text not null default 'bot',
  handoff_reason text,
  lead jsonb,
  history jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, contact)
);

create index if not exists conversations_business_updated_idx
  on conversations (business_id, updated_at desc);

create table if not exists appointments (
  id uuid primary key,
  business_id text not null,
  conversation_id uuid not null references conversations (id) on delete cascade,
  customer_name text not null,
  contact text not null,
  service_id text not null,
  staff_id text,
  -- Çalışanı olmayan işletmeler tek takvim gibi davranır: '_'.
  resource text generated always as (coalesce(staff_id, '_')) stored,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  -- Aynı işletmede aynı kaynağa zaman aralığı çakışan iki randevu olamaz.
  constraint appointments_no_overlap exclude using gist (
    business_id with =,
    resource with =,
    tstzrange(start_at, end_at) with &&
  )
);

create index if not exists appointments_business_start_idx on appointments (business_id, start_at);

create table if not exists processed_messages (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists waitlist (
  id uuid primary key,
  business_name text not null,
  business_type text,
  contact_name text not null,
  phone text not null,
  city text,
  created_at timestamptz not null default now()
);
