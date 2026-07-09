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
  return (await db.getAll('history')).filter((e: any) => !e.deleted);
}

export async function saveWhiteStatsEntry(entry: WhiteStatsEntry): Promise<number> {
  const db = await getDb();
  return db.add('history', { ...entry, uuid: crypto.randomUUID(), timestamp: Date.now(), deleted: false }) as Promise<number>;
}

export async function deleteWhiteStatsEntry(id: number): Promise<void> {
  const db = await getDb();
  const e = await db.get('history', id);
  if (e) { (e as any).deleted = true; (e as any).timestamp = Date.now(); await db.put('history', e); }
}

export async function clearWhiteStatsHistory(): Promise<void> {
  const db = await getDb();
  await db.clear('history');
}
