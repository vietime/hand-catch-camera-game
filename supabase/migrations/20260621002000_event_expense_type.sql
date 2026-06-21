alter table public.events
  add column if not exists expense_type text not null default 'event'
  check (expense_type in ('shared-expense', 'event'));

create index if not exists events_fund_expense_type_created_at_idx
on public.events(fund_id, expense_type, created_at desc);
