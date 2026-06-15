import { openDB, type IDBPDatabase } from 'idb';
import type { WhiteStatsInput } from '../engine/whiteStats';
import type { Bonus6 } from '../engine/whiteStatsData';

export interface WhiteStatsEntry {
  id?: number;
  timestamp: number;
  label: string;         // e.g. character name
  input: WhiteStatsInput;
  totalStats: Bonus6;
  resonanceEff: Bonus6;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB('hbr-white-stats', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export async function getWhiteStatsHistory(): Promise<WhiteStatsEntry[]> {
  const db = await getDb();
  return db.getAll('history');
}

export async function saveWhiteStatsEntry(entry: WhiteStatsEntry): Promise<number> {
  const db = await getDb();
  return db.add('history', { ...entry, timestamp: Date.now() }) as Promise<number>;
}

export async function deleteWhiteStatsEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('history', id);
}

export async function clearWhiteStatsHistory(): Promise<void> {
  const db = await getDb();
  await db.clear('history');
}
