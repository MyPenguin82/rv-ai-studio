-- Chat history retention: keep chats for 3 days, then delete them.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.

-- 1) New chats expire 3 days after they are created.
alter table public.chats
  alter column expires_at set default (now() + interval '3 days');

-- 2) Shorten existing chats to at most 3 days from their creation.
update public.chats
set expires_at = least(expires_at, created_at + interval '3 days');

-- 3) Delete everything that has already expired.
delete from public.chats where expires_at < now();

-- 4) Delete expired chats automatically, every hour.
create extension if not exists pg_cron;

select cron.schedule(
  'delete-expired-chats',
  '0 * * * *',
  $$ delete from public.chats where expires_at < now() $$
);
