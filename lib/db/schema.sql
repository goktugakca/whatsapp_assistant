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
  -- Panelden elle eklenen randevuların sohbeti yoktur.
  conversation_id uuid references conversations (id) on delete cascade,
  customer_name text not null,
  contact text not null,
  service_id text not null,
  staff_id text,
  -- Çalışanı olmayan işletmeler tek takvim gibi davranır: '_'.
  resource text generated always as (coalesce(staff_id, '_')) stored,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- Sonradan eklenen sütunlar (mevcut veritabanları için).
alter table appointments alter column conversation_id drop not null;
alter table appointments add column if not exists source text not null default 'assistant';
alter table appointments add column if not exists cancelled_at timestamptz;

-- Aynı işletmede aynı kaynağa zaman aralığı çakışan iki aktif randevu olamaz. İptal edilen
-- randevu saati boşaltır. (Eski, iptali hesaba katmayan kısıt kaldırılır.)
alter table appointments drop constraint if exists appointments_no_overlap;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap_active') then
    alter table appointments add constraint appointments_no_overlap_active exclude using gist (
      business_id with =,
      resource with =,
      tstzrange(start_at, end_at) with &&
    ) where (cancelled_at is null);
  end if;
end $$;

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

-- Panelden düzenlenen işletme ayarları (hizmetler, çalışanlar, saatler…). Kayıt yoksa
-- uygulama lib/businesses/ altındaki başlangıç değerini kullanır.
create table if not exists business_settings (
  business_id text primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);
