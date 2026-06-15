import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry, DamageInput, DamageResultData } from '../types';

interface HBRCalcDB extends DBSchema {
  history: {
    key: number;
    value: CalcHistoryEntry;
    indexes: { timestamp: number };
  };
}

const DB_NAME = 'hbr-calc-db';
const DB_VERSION = 1;

async function getDB() {
  return openDB<HBRCalcDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp');
      }
    },
  });
}

export async function saveToHistory(
  label: string,
  input: DamageInput,
  result: DamageResultData
): Promise<number> {
  const db = await getDB();
  const entry: CalcHistoryEntry = {
    timestamp: Date.now(),
    label,
    input,
    result,
  };
  const id = await db.add('history', entry);
  return id as number;
}

export async function getHistory(): Promise<CalcHistoryEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('history', 'timestamp');
  return entries.reverse();
}

export async function getHistoryEntry(id: number): Promise<CalcHistoryEntry | undefined> {
  const db = await getDB();
  return db.get('history', id);
}

export async function updateHistoryEntry(
  id: number,
  label: string,
  input: DamageInput,
  result: DamageResultData
): Promise<void> {
  const db = await getDB();
  const entry: CalcHistoryEntry = {
    id,
    timestamp: Date.now(),
    label,
    input,
    result,
  };
  await db.put('history', entry);
}

export async function duplicateHistoryEntry(id: number): Promise<number> {
  const db = await getDB();
  const entry = await db.get('history', id);
  if (!entry) throw new Error('Entry not found');
  // 深拷贝避免 IDB 对象引用问题；显式删除 id 让 autoIncrement 生效
  const copy = JSON.parse(JSON.stringify(entry)) as CalcHistoryEntry;
  delete copy.id;
  copy.timestamp = Date.now();
  copy.label = (entry.label || '') + ' (副本)';
  const newId = await db.add('history', copy);
  return newId as number;
}

export async function updateHistoryLabel(id: number, label: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('history', id);
  if (!entry) throw new Error('Entry not found');
  entry.label = label;
  await db.put('history', entry);
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('history', id);
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('history');
}
