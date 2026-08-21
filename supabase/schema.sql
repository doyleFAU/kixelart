-- Run this in Supabase: SQL Editor → New query → paste → Run

create table if not exists public.gallery_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) <= 40),
  grid_size smallint not null check (grid_size in (16, 32, 64, 128)),
  pixels jsonb not null,
  palette jsonb not null default '[]'::jsonb,
  recent_colors jsonb not null default '[]'::jsonb,
  current_color text,
  secondary_color text,
  show_grid boolean not null default true,
  mirror_x boolean not null default false,
  brush_size smallint not null default 1 check (brush_size between 1 and 3),
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists gallery_items_user_updated
  on public.gallery_items (user_id, updated_at desc);

alter table public.gallery_items enable row level security;

create policy "gallery_select_own"
  on public.gallery_items for select
  using (auth.uid() = user_id);

create policy "gallery_insert_own"
  on public.gallery_items for insert
  with check (auth.uid() = user_id);

create policy "gallery_update_own"
  on public.gallery_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "gallery_delete_own"
  on public.gallery_items for delete
  using (auth.uid() = user_id);
