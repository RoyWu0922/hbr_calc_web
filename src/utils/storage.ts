import { openDB, type DBSchema } from 'idb';
import type { CalcHistoryEntry, DamageInput, DamageResultData, Folder, PresetTemplate } from '../types';

interface HBRCalcDB extends DBSchema {
  history: {
    key: number;
    value: CalcHistoryEntry;
    indexes: { timestamp: number; folderId: number };
  };
  folders: {
    key: number;
    value: Folder;
    indexes: { type: string };
  };
  presets: {
    key: number;
    value: PresetTemplate;
    indexes: { timestamp: number };
  };
}

const DB_NAME = 'hbr-calc-db';
const DB_VERSION = 5;

async function getDB() {
  return openDB<HBRCalcDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'timestamp');
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('planner_chars')) {
          db.createObjectStore('planner_chars', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('planner_turns')) {
          const store = db.createObjectStore('planner_turns', { keyPath: 'id', autoIncrement: true });
          store.createIndex('turnIndex', 'turnIndex');
        }
        if (!db.objectStoreNames.contains('planner_config')) {
          db.createObjectStore('planner_config', { keyPath: 'key' });
        }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('planner_saves')) {
          const store = db.createObjectStore('planner_saves', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
      }
      if (oldVersion < 4) {
        // Repair: ensure all stores exist (prior versions had split upgrade handlers)
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('planner_chars')) {
          db.createObjectStore('planner_chars', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('planner_turns')) {
          const store = db.createObjectStore('planner_turns', { keyPath: 'id', autoIncrement: true });
          store.createIndex('turnIndex', 'turnIndex');
        }
        if (!db.objectStoreNames.contains('planner_config')) {
          db.createObjectStore('planner_config', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('planner_saves')) {
          const store = db.createObjectStore('planner_saves', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
      }
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('folders')) {
          const foldersStore = db.createObjectStore('folders', { keyPath: 'id', autoIncrement: true });
          foldersStore.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('presets')) {
          const presetsStore = db.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
          presetsStore.createIndex('timestamp', 'timestamp');
        }
        // Add folderId index to history store if it exists
        if (db.objectStoreNames.contains('history')) {
          const tx = db.transaction as unknown as { objectStore: (name: string) => IDBObjectStore } | undefined;
          // Index creation inside upgrade must use the implicit transaction's object stores
          // We can't use tx here, but the upgrade transaction is auto-scoped
        }
      }
    },
  });
}

// ─── History CRUD ──────────────────────────────────────────

export async function saveToHistory(
  label: string,
  input: DamageInput,
  result: DamageResultData,
  notes = ''
): Promise<number> {
  const db = await getDB();
  const entry: CalcHistoryEntry = {
    timestamp: Date.now(),
    label,
    input,
    result,
    notes: notes || undefined,
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
  result: DamageResultData,
  notes = ''
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('history', id);
  const entry: CalcHistoryEntry = {
    id,
    timestamp: Date.now(),
    label,
    input,
    result,
    notes: notes || undefined,
    folderId: existing?.folderId,
  };
  await db.put('history', entry);
}

export async function duplicateHistoryEntry(id: number): Promise<number> {
  const db = await getDB();
  const entry = await db.get('history', id);
  if (!entry) throw new Error('Entry not found');
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

export async function updateHistoryNotes(id: number, notes: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('history', id);
  if (!entry) throw new Error('Entry not found');
  entry.notes = notes;
  await db.put('history', entry);
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('history', id);
}

export async function deleteHistoryEntries(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('history', 'readwrite');
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('history');
}

// ─── History Export/Import ─────────────────────────────────

export async function getAllHistory(): Promise<CalcHistoryEntry[]> {
  const db = await getDB();
  return db.getAll('history');
}

export async function importHistoryEntries(entries: CalcHistoryEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('history', 'readwrite');
  for (const entry of entries) {
    const clean = JSON.parse(JSON.stringify(entry)) as CalcHistoryEntry;
    delete clean.id;
    if (!clean.timestamp) clean.timestamp = Date.now();
    await tx.store.add(clean);
  }
  await tx.done;
}

// ─── Folders ───────────────────────────────────────────────

export async function createFolder(name: string, type: 'calc' | 'planner'): Promise<number> {
  const db = await getDB();
  const folder: Folder = { name, type, timestamp: Date.now(), sortOrder: 0 };
  return db.add('folders', folder) as Promise<number>;
}

export async function getFolders(type: 'calc' | 'planner'): Promise<Folder[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('folders', 'type', type);
  return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function updateFolder(id: number, updates: Partial<Pick<Folder, 'name' | 'sortOrder'>>): Promise<void> {
  const db = await getDB();
  const folder = await db.get('folders', id);
  if (!folder) throw new Error('Folder not found');
  Object.assign(folder, updates);
  await db.put('folders', folder);
}

export async function deleteFolder(id: number): Promise<void> {
  const db = await getDB();
  // Unlink entries from this folder
  const historyEntries = await db.getAll('history');
  for (const e of historyEntries) {
    if (e.folderId === id) {
      e.folderId = undefined;
      await db.put('history', e);
    }
  }
  await db.delete('folders', id);
}

export async function setHistoryFolder(entryId: number, folderId: number | undefined): Promise<void> {
  const db = await getDB();
  const entry = await db.get('history', entryId);
  if (!entry) throw new Error('Entry not found');
  entry.folderId = folderId;
  await db.put('history', entry);
}

// ─── Presets ───────────────────────────────────────────────

export async function savePreset(preset: PresetTemplate): Promise<number> {
  const db = await getDB();
  const entry = { ...preset, timestamp: Date.now() };
  return db.add('presets', entry) as Promise<number>;
}

export async function getPresets(): Promise<PresetTemplate[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('presets', 'timestamp');
  return all.reverse();
}

export async function deletePreset(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('presets', id);
}
