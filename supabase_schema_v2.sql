-- New schema for account sync v2 (UUID-based records)
-- Run in Supabase SQL Editor

-- Drop old tables (optional, backup first)
-- DROP TABLE IF EXISTS calc_history, planner_axles, white_stats;

-- Calc history
CREATE TABLE IF NOT EXISTS calc_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users NOT NULL,
  uuid TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (uuid)
);
CREATE INDEX IF NOT EXISTS idx_ch_user ON calc_history(user_id);

-- Planner axles
CREATE TABLE IF NOT EXISTS planner_axles (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users NOT NULL,
  uuid TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (uuid)
);
CREATE INDEX IF NOT EXISTS idx_pa_user ON planner_axles(user_id);

-- White stats
CREATE TABLE IF NOT EXISTS white_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users NOT NULL,
  uuid TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (uuid)
);
CREATE INDEX IF NOT EXISTS idx_ws_user ON white_stats(user_id);

-- Custom skills (one row per user, localStorage sync)
CREATE TABLE IF NOT EXISTS custom_skills (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE calc_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_axles ENABLE ROW LEVEL SECURITY;
ALTER TABLE white_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own custom_skills" ON custom_skills;
DROP POLICY IF EXISTS "Users own calc_history" ON calc_history;
DROP POLICY IF EXISTS "Users own planner_axles" ON planner_axles;
DROP POLICY IF EXISTS "Users own white_stats" ON white_stats;

CREATE POLICY "Users own custom_skills" ON custom_skills FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own calc_history" ON calc_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own planner_axles" ON planner_axles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own white_stats" ON white_stats FOR ALL USING (auth.uid() = user_id);
