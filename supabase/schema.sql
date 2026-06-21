create table if not exists public.funds (
  id text primary key,
  name text not null,
  bank_code text,
  bank_account_number text,
  bank_account_name text,
  transfer_template text not null default 'QAC-{MA_THANH_VIEN}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fund_members (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  name text not null,
  wallet text,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  member_id text references public.fund_members(id) on delete set null,
  type text not null check (type in ('deposit', 'event-share', 'pending')),
  amount bigint not null check (amount >= 0),
  note text,
  event_id text,
  event_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.deposit_requests (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  member_id text not null references public.fund_members(id) on delete cascade,
  amount bigint not null check (amount > 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  ledger_entry_id text references public.ledger_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.notifications (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  member_id text references public.fund_members(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fund_invites (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  invite_code text not null unique,
  member_id text references public.fund_members(id) on delete cascade,
  email text,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  created_by text,
  expires_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.events (
  id text primary key,
  fund_id text not null references public.funds(id) on delete cascade,
  name text not null,
  total_amount bigint not null check (total_amount >= 0),
  guest_amount bigint not null default 0 check (guest_amount >= 0),
  guest_owner_member_id text references public.fund_members(id) on delete set null,
  split_mode text not null check (split_mode in ('equal', 'owner-pays-guest')),
  expense_type text not null default 'event' check (expense_type in ('shared-expense', 'event')),
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.ledger_entries
  add column if not exists event_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ledger_entries_event_id_fkey'
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_event_id_fkey
      foreign key (event_id) references public.events(id) on delete set null;
  end if;
end $$;

create table if not exists public.event_participants (
  event_id text not null references public.events(id) on delete cascade,
  member_id text not null references public.fund_members(id) on delete cascade,
  charged_amount bigint not null check (charged_amount >= 0),
  note text,
  primary key (event_id, member_id)
);

create table if not exists public.profiles (
  user_id uuid references auth.users(id) on delete cascade,
  fund_id text not null references public.funds(id) on delete cascade,
  member_id text references public.fund_members(id) on delete set null,
  role text not null check (role in ('admin', 'member')),
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, fund_id)
);

create index if not exists fund_members_fund_id_idx on public.fund_members(fund_id);
create index if not exists ledger_entries_fund_id_created_at_idx on public.ledger_entries(fund_id, created_at desc);
create index if not exists ledger_entries_member_id_idx on public.ledger_entries(member_id);
create index if not exists deposit_requests_fund_id_created_at_idx on public.deposit_requests(fund_id, created_at desc);
create index if not exists deposit_requests_member_id_idx on public.deposit_requests(member_id);
create index if not exists notifications_fund_id_created_at_idx on public.notifications(fund_id, created_at desc);
create index if not exists notifications_member_id_idx on public.notifications(member_id);
create index if not exists fund_invites_fund_id_created_at_idx on public.fund_invites(fund_id, created_at desc);
create index if not exists fund_invites_code_idx on public.fund_invites(invite_code);
create index if not exists events_fund_id_created_at_idx on public.events(fund_id, created_at desc);
create index if not exists events_fund_expense_type_created_at_idx on public.events(fund_id, expense_type, created_at desc);
create index if not exists profiles_fund_id_idx on public.profiles(fund_id);
create index if not exists profiles_member_id_idx on public.profiles(member_id);
create unique index if not exists profiles_fund_member_unique_idx
on public.profiles(fund_id, member_id)
where member_id is not null;

alter table public.funds enable row level security;
alter table public.fund_members enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.deposit_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.fund_invites enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "prototype_read_funds" on public.funds;
drop policy if exists "prototype_write_funds" on public.funds;
drop policy if exists "prototype_read_members" on public.fund_members;
drop policy if exists "prototype_write_members" on public.fund_members;
drop policy if exists "prototype_read_ledger" on public.ledger_entries;
drop policy if exists "prototype_write_ledger" on public.ledger_entries;
drop policy if exists "prototype_read_events" on public.events;
drop policy if exists "prototype_write_events" on public.events;
drop policy if exists "prototype_read_event_participants" on public.event_participants;
drop policy if exists "prototype_write_event_participants" on public.event_participants;
