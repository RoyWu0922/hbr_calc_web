-- Run this in Supabase SQL Editor to create the tables

-- Calc history
CREATE TABLE IF NOT EXISTS calc_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calc_history_user ON calc_history(user_id, timestamp);

-- Planner axles
CREATE TABLE IF NOT EXISTS planner_axles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_planner_axles_user ON planner_axles(user_id, timestamp);

-- White stats
CREATE TABLE IF NOT EXISTS white_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_white_stats_user ON white_stats(user_id, timestamp);

-- Custom skills (one row per user)
CREATE TABLE IF NOT EXISTS custom_skills (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);

-- ─── Row Level Security ─────────────────────────────────────────
ALTER TABLE calc_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_axles ENABLE ROW LEVEL SECURITY;
ALTER TABLE white_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_skills ENABLE ROW LEVEL SECURITY;

-- Allow users to CRUD only their own data
CREATE POLICY "Users manage own calc history" ON calc_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own axles" ON planner_axles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own white stats" ON white_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own skills" ON custom_skills FOR ALL USING (auth.uid() = user_id);
