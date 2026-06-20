alter table public.funds
  add column if not exists bank_code text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_name text,
  add column if not exists transfer_template text not null default 'QAC-{MA_THANH_VIEN}';
