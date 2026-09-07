import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'hbr.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  user_metadata TEXT
);

CREATE TABLE IF NOT EXISTS calc_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  uuid TEXT UNIQUE,
  data TEXT,
  timestamp INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ch_user ON calc_history(user_id);

CREATE TABLE IF NOT EXISTS planner_axles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  uuid TEXT UNIQUE,
  data TEXT,
  timestamp INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pa_user ON planner_axles(user_id);

CREATE TABLE IF NOT EXISTS white_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  uuid TEXT UNIQUE,
  data TEXT,
  timestamp INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ws_user ON white_stats(user_id);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);

CREATE TABLE IF NOT EXISTS custom_skills (
  user_id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS medal_records (
  user_id TEXT PRIMARY KEY,
  data TEXT,
  updated_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guide_entries (
  id TEXT PRIMARY KEY,
  category TEXT,
  period INTEGER,
  stage TEXT,
  attribute TEXT,
  weather INTEGER,
  turns INTEGER,
  team TEXT,
  author TEXT,
  video_url TEXT,
  image_url TEXT,
  notes TEXT,
  score INTEGER,
  status TEXT DEFAULT 'pending',
  user_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guide_likes (
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (entry_id, user_id)
);

CREATE TABLE IF NOT EXISTS guide_comments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author TEXT,
  content TEXT,
  created_at TEXT,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS guide_comments_entry_idx ON guide_comments(entry_id, created_at);
`);

export { crypto };
