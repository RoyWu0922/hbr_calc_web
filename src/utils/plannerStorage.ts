import { openDB, type DBSchema } from 'idb';
import type { TurnPlannerState, PlannerTurn, ODMode, TurnPlannerChar } from '../types';

interface HBRCalcDB extends DBSchema {
  history: {
    key: number;
    value: { id?: number; label: string; timestamp: number; input: any; result: any; notes?: string; folderId?: number };
    indexes: { timestamp: number };
  };
  planner_chars: {
    key: number;
    value: { id: number; name: string; sp: number };
  };
  planner_turns: {
    key: number;
    value: PlannerTurn & { id?: number };
    indexes: { turnIndex: number };
  };
  planner_config: {
    key: string;
    value: { key: string; value: unknown };
  };
  planner_saves: {
    key: number;
    value: { id?: number; label: string; timestamp: number; state: TurnPlannerState; score: number; turns: number; author: string; notes: string; folderId?: number };
    indexes: { timestamp: number };
  };
  folders: {
    key: number;
    value: { id?: number; name: string; type: string; timestamp: number; sortOrder: number };
    indexes: { type: string };
  };
  presets: {
    key: number;
    value: { id?: number; name: string; timestamp: number };
    indexes: { timestamp: number };
  };
}

const DB_NAME = 'hbr-calc-db';
let DB_VERSION = 5;

async function getDB() {
  return openDB<HBRCalcDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
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
      }
    },
  });
}

// ─── Characters ────────────────────────────────────────────

export async function savePlannerChars(chars: TurnPlannerChar[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('planner_chars', 'readwrite');
  for (let i = 0; i < 6; i++) {
    await tx.store.put({ id: i, name: chars[i].name, sp: chars[i].sp });
  }
  await tx.done;
}

export async function loadPlannerChars(): Promise<TurnPlannerChar[]> {
  const db = await getDB();
  const chars: TurnPlannerChar[] = [];
  for (let i = 0; i < 6; i++) {
    const stored = await db.get('planner_chars', i);
    if (stored) {
      chars.push({ name: stored.name, sp: stored.sp });
    } else {
      chars.push({ name: '', sp: 0 });
    }
  }
  return chars;
}

// ─── Turns ─────────────────────────────────────────────────

export async function savePlannerTurns(turns: PlannerTurn[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('planner_turns', 'readwrite');
  // Clear existing turns
  await tx.store.clear();
  for (let i = 0; i < turns.length; i++) {
    await tx.store.put({ ...turns[i], turnIndex: i } as any);
  }
  await tx.done;
}

export async function loadPlannerTurns(): Promise<PlannerTurn[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('planner_turns', 'turnIndex');
  // Remove id/turnIndex from stored objects
  return all.map(({ id, turnIndex, ...turn }: any) => turn as PlannerTurn);
}

// ─── Config ────────────────────────────────────────────────

export async function savePlannerConfig(config: { odMode: ODMode; defaultPassiveOD: number; showBreak: boolean; showEncounter: boolean; showPursuit: boolean }): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('planner_config', 'readwrite');
  await tx.store.put({ key: 'odMode', value: config.odMode });
  await tx.store.put({ key: 'defaultPassiveOD', value: config.defaultPassiveOD });
  await tx.store.put({ key: 'showBreak', value: config.showBreak });
  await tx.store.put({ key: 'showEncounter', value: config.showEncounter });
  await tx.store.put({ key: 'showPursuit', value: config.showPursuit });
  await tx.done;
}

export async function loadPlannerConfig(): Promise<{ odMode: ODMode; defaultPassiveOD: number; showBreak: boolean; showEncounter: boolean; showPursuit: boolean }> {
  const db = await getDB();
  const odMode = await db.get('planner_config', 'odMode');
  const passive = await db.get('planner_config', 'defaultPassiveOD');
  const showBreak = await db.get('planner_config', 'showBreak');
  const showEncounter = await db.get('planner_config', 'showEncounter');
  const showPursuit = await db.get('planner_config', 'showPursuit');
  return {
    odMode: (odMode?.value as ODMode) || 300,
    defaultPassiveOD: (passive?.value as number) || 0,
    showBreak: (showBreak?.value as boolean) || false,
    showEncounter: (showEncounter?.value as boolean) || false,
    showPursuit: (showPursuit?.value as boolean) || false,
  };
}

// ─── Full state ────────────────────────────────────────────

export async function savePlannerState(state: TurnPlannerState): Promise<void> {
  await savePlannerChars(state.characters as unknown as TurnPlannerChar[]);
  await savePlannerTurns(state.turns);
  await savePlannerConfig({ odMode: state.odMode, defaultPassiveOD: state.defaultPassiveOD, showBreak: state.showBreak, showEncounter: state.showEncounter, showPursuit: state.showPursuit });
}

export async function loadPlannerState(): Promise<TurnPlannerState | null> {
  const db = await getDB();
  const hasChars = await db.count('planner_chars');
  if (hasChars === 0) return null; // No saved state

  const characters = await loadPlannerChars();
  const turns = await loadPlannerTurns();
  const config = await loadPlannerConfig();

  // Ensure exactly 6 characters
  while (characters.length < 6) characters.push({ name: '', sp: 0 });

  return {
    odMode: config.odMode,
    defaultPassiveOD: config.defaultPassiveOD,
    showBreak: config.showBreak,
    showEncounter: config.showEncounter,
    showPursuit: config.showPursuit,
    characters: characters as TurnPlannerState['characters'],
    turns: turns.length > 0 ? turns : [],
  };
}

export async function clearPlannerState(): Promise<void> {
  const db = await getDB();
  await db.clear('planner_chars');
  await db.clear('planner_turns');
  await db.clear('planner_config');
}

// ─── Saved Axles ───────────────────────────────────────────

export interface SavedAxle {
  id?: number;
  label: string;
  timestamp: number;
  state: TurnPlannerState;
  score: number;
  turns: number;
  author: string;
  notes: string;
  folderId?: number;
}

export async function saveAxle(label: string, state: TurnPlannerState, score = 0, turns = 0, author = '', notes = ''): Promise<number> {
  const db = await getDB();
  const entry: any = { uuid: crypto.randomUUID(), label, timestamp: Date.now(), state: JSON.parse(JSON.stringify(state)), score, turns, author, notes, deleted: false };
  return db.add('planner_saves', entry) as Promise<number>;
}

export async function getSavedAxles(): Promise<SavedAxle[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('planner_saves', 'timestamp');
  return all.filter(e => !(e as any).deleted).reverse();
}

export async function updateAxleLabel(id: number, label: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('planner_saves', id);
  if (!entry) return;
  entry.label = label;
  await db.put('planner_saves', entry);
}

export async function updateAxle(id: number, label: string, state: TurnPlannerState, score: number, turns: number, author = '', notes = ''): Promise<void> {
  const db = await getDB();
  const entry = await db.get('planner_saves', id);
  if (!entry) throw new Error('Not found');
  const existingFolderId = entry.folderId;
  entry.label = label;
  entry.state = JSON.parse(JSON.stringify(state));
  entry.score = score;
  entry.turns = turns;
  entry.author = author;
  entry.notes = notes;
  entry.folderId = existingFolderId;
  entry.timestamp = Date.now();
  await db.put('planner_saves', entry);
}

export async function duplicateAxle(id: number): Promise<number> {
  const db = await getDB();
  const entry = await db.get('planner_saves', id);
  if (!entry) throw new Error('Not found');
  const copy = JSON.parse(JSON.stringify(entry)) as SavedAxle;
  delete copy.id;
  copy.timestamp = Date.now();
  copy.label = (entry.label || '') + ' (副本)';
  return db.add('planner_saves', copy) as Promise<number>;
}

export async function clearAllAxles(): Promise<void> {
  const db = await getDB();
  await db.clear('planner_saves');
}

export async function deleteAxle(id: number): Promise<void> {
  const db = await getDB();
  const entry: any = await db.get('planner_saves', id);
  if (entry) { entry.deleted = true; entry.timestamp = Date.now(); await db.put('planner_saves', entry); }
}

export async function deleteAxles(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('planner_saves', 'readwrite');
  for (const id of ids) {
    const entry: any = await tx.store.get(id);
    if (entry) { entry.deleted = true; entry.timestamp = Date.now(); await tx.store.put(entry); }
  }
  await tx.done;
}

// ─── Axle Export/Import ────────────────────────────────────

export async function getAllAxles(): Promise<SavedAxle[]> {
  const db = await getDB();
  return db.getAll('planner_saves');
}

export async function importAxles(axles: SavedAxle[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('planner_saves', 'readwrite');
  for (const axle of axles) {
    const clean = JSON.parse(JSON.stringify(axle)) as SavedAxle;
    delete clean.id;
    if (!clean.timestamp) clean.timestamp = Date.now();
    await tx.store.add(clean);
  }
  await tx.done;
}

// ─── Folder helpers for planner ────────────────────────────

export async function setAxleFolder(axleId: number, folderId: number | undefined): Promise<void> {
  const db = await getDB();
  const entry = await db.get('planner_saves', axleId);
  if (!entry) throw new Error('Axle not found');
  entry.folderId = folderId;
  await db.put('planner_saves', entry);
}
