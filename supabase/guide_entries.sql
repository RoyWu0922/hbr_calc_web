-- 攻略资讯（异时层EX / 打分EX）作业表 + 行级安全(RLS)
-- 在 Supabase Dashboard → SQL Editor 执行一次（可重复执行，幂等）。
-- 执行前：确认 is_guide_admin() 中的 UUID 为真实管理员用户 UUID
-- （与前端 src/config/admin.ts 的 ADMIN_USER_IDS 保持一致；UUID 在 Authentication → Users 查看）。

create table if not exists public.guide_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null,            -- 'ex' | 'score'
  period int not null,               -- 期数
  stage text,                        -- 'P1' | 'P2' | null（异时层EX）
  attribute text not null,           -- 火/冰/雷/光/暗/无
  weather boolean,                   -- 需要天气（异时层EX）
  turns int not null,                -- 1~15
  team jsonb not null,               -- [{characterId, break} x6]
  author text not null,
  video_url text,
  image_url text,
  notes text,
  score int,                         -- 打分EX
  status text not null default 'pending',  -- pending | approved | rejected
  user_id uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted boolean default false
);

-- 点赞数（冗余计数，由 toggle_guide_like 维护）
alter table public.guide_entries add column if not exists like_count integer not null default 0;

create index if not exists guide_entries_category_idx on public.guide_entries (category, status, deleted);

-- 点赞明细表：记录「谁点了哪篇」，主键唯一约束防重复点赞
create table if not exists public.guide_likes (
  entry_id uuid not null references public.guide_entries(id) on delete cascade,
  user_id uuid not null references auth.users,
  created_at timestamptz default now(),
  primary key (entry_id, user_id)
);

-- 管理员判断：硬编码管理员 UUID 数组
create or replace function public.is_guide_admin()
returns boolean
language sql
stable
security definer
as $$
  select auth.uid() = any( array['c97da159-b8c1-442a-bf02-97b9de28e1c4']::uuid[] )
$$;

-- 点赞/取消点赞（原子）：切换当前用户对该作业的点赞，回写 like_count，返回新计数（未登录返回 -1）
create or replace function public.toggle_guide_like(p_entry_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  liked boolean;
  new_count int;
begin
  if auth.uid() is null then
    return -1;
  end if;

  select exists(select 1 from public.guide_likes where entry_id = p_entry_id and user_id = auth.uid()) into liked;

  if liked then
    delete from public.guide_likes where entry_id = p_entry_id and user_id = auth.uid();
  else
    insert into public.guide_likes (entry_id, user_id) values (p_entry_id, auth.uid());
  end if;

  select count(*) from public.guide_likes where entry_id = p_entry_id into new_count;
  update public.guide_entries set like_count = new_count where id = p_entry_id;

  return new_count;
end;
$$;

grant execute on function public.toggle_guide_like(uuid) to authenticated, anon;

alter table public.guide_entries enable row level security;
alter table public.guide_likes enable row level security;

-- 读：匿名用户只读已审核；管理员可见全部（含待审）
drop policy if exists "guide_read" on public.guide_entries;
create policy "guide_read" on public.guide_entries
  for select
  using ( (status = 'approved' and deleted = false) or public.is_guide_admin() );

-- 写：本人投稿；普通用户只能投待审，管理员可直接发布
drop policy if exists "guide_insert" on public.guide_entries;
create policy "guide_insert" on public.guide_entries
  for insert
  with check ( auth.uid() = user_id and (status = 'pending' or public.is_guide_admin()) );

-- 改：管理员可改所有人的；投稿者可改自己的（含已审核发布的作业）
drop policy if exists "guide_update" on public.guide_entries;
create policy "guide_update" on public.guide_entries
  for update
  using ( public.is_guide_admin() or auth.uid() = user_id )
  with check ( public.is_guide_admin() or auth.uid() = user_id );

-- 删：仅管理员（前端统一走软删，保留此策略兜底）
drop policy if exists "guide_delete" on public.guide_entries;
create policy "guide_delete" on public.guide_entries
  for delete
  using ( public.is_guide_admin() );

-- 点赞表 RLS：本人可读/增/删自己的点赞
drop policy if exists "guide_likes_read" on public.guide_likes;
create policy "guide_likes_read" on public.guide_likes
  for select
  using ( auth.uid() = user_id );

drop policy if exists "guide_likes_write" on public.guide_likes;
create policy "guide_likes_write" on public.guide_likes
  for insert
  with check ( auth.uid() = user_id );

drop policy if exists "guide_likes_delete" on public.guide_likes;
create policy "guide_likes_delete" on public.guide_likes
  for delete
  using ( auth.uid() = user_id );

-- ─── 评论 ─────────────────────────────────────────────
-- 评论区：登录用户对每篇（已审核）作业发表评论；直接发布，本人可删，管理员可隐藏任意
create table if not exists public.guide_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.guide_entries(id) on delete cascade,
  user_id uuid not null references auth.users,
  author text not null,      -- 登录用户名（展示用，denormalized）
  content text not null check (length(content) between 1 and 500),
  created_at timestamptz default now(),
  deleted boolean default false
);

create index if not exists guide_comments_entry_idx on public.guide_comments (entry_id, created_at);

alter table public.guide_comments enable row level security;

-- 读：仅未删且所属作业已审核的评论；管理员全量
drop policy if exists "guide_comments_read" on public.guide_comments;
create policy "guide_comments_read" on public.guide_comments
  for select using (
    ( deleted = false
      and exists (select 1 from public.guide_entries e where e.id = entry_id and e.status = 'approved' and e.deleted = false) )
    or public.is_guide_admin()
  );

-- 写：本人，且 author 必须等于 JWT 里的用户名（防冒充他人/假名）
drop policy if exists "guide_comments_insert" on public.guide_comments;
create policy "guide_comments_insert" on public.guide_comments
  for insert with check (
    auth.uid() = user_id
    and author = coalesce(auth.jwt() -> 'user_metadata' ->> 'username', '')
  );

-- 改：本人可改/软删自己的，管理员可隐藏任意；author 不可被改成假名
drop policy if exists "guide_comments_update" on public.guide_comments;
create policy "guide_comments_update" on public.guide_comments
  for update using ( public.is_guide_admin() or auth.uid() = user_id )
  with check ( public.is_guide_admin() or (
    auth.uid() = user_id and author = coalesce(auth.jwt() -> 'user_metadata' ->> 'username', '')
  ) );

-- 删：仅管理员（兜底硬删，前端统一走软删）
drop policy if exists "guide_comments_delete" on public.guide_comments;
create policy "guide_comments_delete" on public.guide_comments
  for delete using ( public.is_guide_admin() );
