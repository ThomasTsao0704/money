-- 在 Supabase SQL Editor 執行（升級版）

create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  symbol text,
  type text,
  entry_price numeric,
  exit_price numeric,
  qty numeric,
  profit numeric,
  note text,
  -- 新增：Tag 系統
  tags text[],
  -- 新增：情緒紀錄
  mood text,           -- '冷靜' | '焦躁' | '衝動' | '恐懼' | '自信'
  confidence int,      -- 1~5
  reason text,         -- 進場理由
  created_at timestamp default now()
);

alter table trades enable row level security;

create policy "Users can access their own trades"
on trades
for all
using (auth.uid() = user_id);
