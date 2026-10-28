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
alter table appointments add column if not exists reminder_sent_at timestamptz;

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

-- İşletme paneli kullanıcıları. Her kullanıcı tek bir işletmeyi yönetir; yönetici (admin)
-- veritabanında değil, PANEL_PASSWORD ile girer.
create table if not exists panel_users (
  id uuid primary key,
  username text not null unique,
  password_hash text not null,
  business_id text not null,
  created_at timestamptz not null default now()
);

-- Müşterilerin WhatsApp'tan gönderdiği fotoğraflar (ör. fiyat sormak için saç fotoğrafı).
-- Konuşma geçmişinde sadece kimlik tutulur; panelde ve modele gönderirken buradan okunur.
create table if not exists media (
  id uuid primary key,
  business_id text not null,
  conversation_id uuid references conversations (id) on delete cascade,
  mime_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists media_conversation_idx on media (conversation_id);

-- Geçmiş konuşmalardan içe aktarılan fotoğrafların sohbeti yoktur.
alter table media alter column conversation_id drop not null;

-- Fotoğrafa göre fiyat örnekleri (salonun geçmiş WhatsApp yazışmalarından). Fotoğraflar media
-- tablosunda; sadece o işletmenin asistanında kullanılır.
create table if not exists price_examples (
  id uuid primary key,
  business_id text not null,
  media_ids jsonb not null,
  image_hash text not null,
  customer_text text not null default '',
  staff_reply text not null default '',
  price_text text,
  price_min integer,
  price_max integer,
  included boolean not null default true,
  said_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (business_id, image_hash)
);

-- İşletmenin bağladığı Instagram hesabı. Erişim anahtarı uygulama tarafında şifrelenir.
create table if not exists instagram_accounts (
  business_id text primary key,
  account_id text not null unique,
  username text,
  sealed_token text not null,
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);
