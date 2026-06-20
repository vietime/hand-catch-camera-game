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

create index if not exists notifications_fund_id_created_at_idx on public.notifications(fund_id, created_at desc);
create index if not exists notifications_member_id_idx on public.notifications(member_id);

alter table public.notifications enable row level security;
