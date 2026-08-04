-- Haggle backend schema. Run this in the Supabase SQL editor for a new project.
-- Keep RLS OFF on these tables (default) since only the service-role key,
-- used exclusively by this backend, ever touches them. The desktop app
-- never talks to Supabase directly.

create extension if not exists "uuid-ossp";

-- One row per installed device (HWID-bound), matching the existing
-- trial/license model in native-module/src/license.rs.
create table if not exists devices (
  id uuid primary key default uuid_generate_v4(),
  hwid text unique not null,
  plan_id text not null default 'free',            -- 'free' | 'ally' | 'command'
  plan_status text not null default 'active',       -- 'active' | 'past_due' | 'canceled'
  plan_renews_at timestamptz,
  dodo_customer_id text,
  dodo_subscription_id text,
  trial_started_at timestamptz,
  trial_converted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_devices_hwid on devices(hwid);
create index if not exists idx_devices_dodo_subscription on devices(dodo_subscription_id);

-- Usage is tracked per device, per calendar-month period, so quota resets
-- naturally. sessions_used enforces the "N negotiations/month" cap from
-- lib/plans.ts; minutes_used is tracked too so you can switch to
-- minutes-based metering later without a schema change.
create table if not exists usage_records (
  id uuid primary key default uuid_generate_v4(),
  device_id uuid not null references devices(id) on delete cascade,
  period_start date not null,                       -- first of the month, e.g. 2026-08-01
  sessions_used integer not null default 0,
  minutes_used numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (device_id, period_start)
);

-- Raw Dodo webhook log — useful for debugging entitlement issues without
-- needing to re-fetch from Dodo's dashboard.
create table if not exists dodo_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
