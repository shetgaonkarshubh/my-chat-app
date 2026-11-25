-- ==========================================================
-- Self Chat Space - Supabase Schema & Storage Setup
-- Run this once in your Supabase Dashboard -> SQL Editor
-- ==========================================================

-- 1. Folders table
create table if not exists public.folders (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 2. Rooms table
create table if not exists public.rooms (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  folder text,
  created_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 3. Messages table
create table if not exists public.messages (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  room text not null,
  type text not null default 'text',
  text text,
  file_path text,
  file_name text,
  file_size bigint default 0,
  file_type text,
  timestamp text,
  edited boolean default false,
  updated_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 4. Todos table
create table if not exists public.todos (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  done boolean default false,
  updated_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- Indexes for fast per-user queries
create index if not exists idx_folders_user on public.folders(user_id);
create index if not exists idx_rooms_user on public.rooms(user_id);
create index if not exists idx_messages_user_updated on public.messages(user_id, updated_at);
create index if not exists idx_todos_user_updated on public.todos(user_id, updated_at);

-- ==========================================================
-- Row Level Security (RLS) - Each user only sees their own data
-- ==========================================================
alter table public.folders enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.todos enable row level security;

drop policy if exists "Users manage own folders" on public.folders;
create policy "Users manage own folders" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own rooms" on public.rooms;
create policy "Users manage own rooms" on public.rooms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own messages" on public.messages;
create policy "Users manage own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own todos" on public.todos;
create policy "Users manage own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================================
-- Enable Realtime Sync across Phone & Laptop
-- ==========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'folders'
  ) then
    alter publication supabase_realtime add table public.folders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'todos'
  ) then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;

-- ==========================================================
-- Private Storage Bucket for Media & File Attachments
-- ==========================================================
insert into storage.buckets (id, name, public)
values ('self-chat-media', 'self-chat-media', false)
on conflict (id) do nothing;

drop policy if exists "Users upload own media" on storage.objects;
create policy "Users upload own media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'self-chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own media" on storage.objects;
create policy "Users read own media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'self-chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own media" on storage.objects;
create policy "Users delete own media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'self-chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
