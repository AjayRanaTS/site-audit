create table if not exists public.audit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_url text not null,
  audited_at timestamptz not null default now(),
  audit_status text not null default 'completed',
  result jsonb not null
);

create index if not exists audit_history_user_audited_at_idx
  on public.audit_history (user_id, audited_at desc);

alter table public.audit_history enable row level security;

drop policy if exists "Users can read their own audit history" on public.audit_history;
create policy "Users can read their own audit history"
  on public.audit_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own audit history" on public.audit_history;
create policy "Users can create their own audit history"
  on public.audit_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.audit_history to authenticated;
revoke all on public.audit_history from anon, public;

notify pgrst, 'reload schema';
