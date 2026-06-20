create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fund_id text not null references public.funds(id) on delete cascade,
  member_id text references public.fund_members(id) on delete set null,
  role text not null check (role in ('admin', 'member')),
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_fund_id_idx on public.profiles(fund_id);
create index if not exists profiles_member_id_idx on public.profiles(member_id);

alter table public.profiles enable row level security;

create or replace function public.current_profile_member_id(target_fund_id text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select member_id
  from public.profiles
  where user_id = auth.uid()
    and fund_id = target_fund_id
  limit 1
$$;

create or replace function public.is_fund_admin(target_fund_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and fund_id = target_fund_id
      and role = 'admin'
  )
$$;

create or replace function public.is_fund_member(target_fund_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and fund_id = target_fund_id
  )
$$;

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

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_admin_write" on public.profiles;
drop policy if exists "funds_select_member" on public.funds;
drop policy if exists "funds_admin_write" on public.funds;
drop policy if exists "fund_members_select_admin_or_self" on public.fund_members;
drop policy if exists "fund_members_admin_write" on public.fund_members;
drop policy if exists "ledger_select_admin_or_self" on public.ledger_entries;
drop policy if exists "ledger_admin_write" on public.ledger_entries;
drop policy if exists "deposit_requests_select_admin_or_self" on public.deposit_requests;
drop policy if exists "deposit_requests_member_insert" on public.deposit_requests;
drop policy if exists "deposit_requests_admin_update" on public.deposit_requests;
drop policy if exists "notifications_select_admin_or_self" on public.notifications;
drop policy if exists "notifications_admin_insert" on public.notifications;
drop policy if exists "events_select_admin_or_participant" on public.events;
drop policy if exists "events_admin_write" on public.events;
drop policy if exists "participants_select_admin_or_self" on public.event_participants;
drop policy if exists "participants_admin_write" on public.event_participants;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (user_id = auth.uid() or public.is_fund_admin(fund_id));

create policy "profiles_admin_write"
on public.profiles
for all
using (public.is_fund_admin(fund_id))
with check (public.is_fund_admin(fund_id));

create policy "funds_select_member"
on public.funds
for select
using (public.is_fund_member(id));

create policy "funds_admin_write"
on public.funds
for all
using (public.is_fund_admin(id))
with check (public.is_fund_admin(id));

create policy "fund_members_select_admin_or_self"
on public.fund_members
for select
using (public.is_fund_admin(fund_id) or id = public.current_profile_member_id(fund_id));

create policy "fund_members_admin_write"
on public.fund_members
for all
using (public.is_fund_admin(fund_id))
with check (public.is_fund_admin(fund_id));

create policy "ledger_select_admin_or_self"
on public.ledger_entries
for select
using (public.is_fund_admin(fund_id) or member_id = public.current_profile_member_id(fund_id));

create policy "ledger_admin_write"
on public.ledger_entries
for all
using (public.is_fund_admin(fund_id))
with check (public.is_fund_admin(fund_id));

create policy "deposit_requests_select_admin_or_self"
on public.deposit_requests
for select
using (public.is_fund_admin(fund_id) or member_id = public.current_profile_member_id(fund_id));

create policy "deposit_requests_member_insert"
on public.deposit_requests
for insert
with check (
  member_id = public.current_profile_member_id(fund_id)
  and status = 'pending'
  and reviewed_by is null
  and ledger_entry_id is null
  and reviewed_at is null
);

create policy "deposit_requests_admin_update"
on public.deposit_requests
for update
using (public.is_fund_admin(fund_id))
with check (public.is_fund_admin(fund_id));

create policy "notifications_select_admin_or_self"
on public.notifications
for select
using (
  public.is_fund_admin(fund_id)
  or member_id is null
  or member_id = public.current_profile_member_id(fund_id)
);

create policy "notifications_admin_insert"
on public.notifications
for insert
with check (public.is_fund_admin(fund_id));

create policy "events_select_admin_or_participant"
on public.events
for select
using (
  public.is_fund_admin(fund_id)
  or exists (
    select 1
    from public.event_participants ep
    where ep.event_id = events.id
      and ep.member_id = public.current_profile_member_id(events.fund_id)
  )
);

create policy "events_admin_write"
on public.events
for all
using (public.is_fund_admin(fund_id))
with check (public.is_fund_admin(fund_id));

create policy "participants_select_admin_or_self"
on public.event_participants
for select
using (
  exists (
    select 1
    from public.events e
    where e.id = event_participants.event_id
      and (
        public.is_fund_admin(e.fund_id)
        or event_participants.member_id = public.current_profile_member_id(e.fund_id)
      )
  )
);

create policy "participants_admin_write"
on public.event_participants
for all
using (
  exists (
    select 1
    from public.events e
    where e.id = event_participants.event_id
      and public.is_fund_admin(e.fund_id)
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_participants.event_id
      and public.is_fund_admin(e.fund_id)
  )
);
