import { useState, useCallback } from 'react';
import type { MedalCharacter } from '../data/medalData';
export type { MedalCharacter };

export interface CharMedalRecord {
  cats: Record<string, number>;   // catKey -> completed real tiers (cumulative)
  jewels: Record<string, number>; // jewelIdx -> 0..100
}

export type MedalRecord = Record<string, CharMedalRecord>; // keyed by character id

export interface RecordMeta { id: string; name: string; createdAt: number }
export interface MedalRecordsStore {
  activeId: string;
  updatedAt?: number;
  records: Record<string, { meta: RecordMeta; data: MedalRecord }>;
}

export const MEDAL_STORAGE_KEY = 'hbr_medal_records';
const LEGACY_KEY = 'hbr_medal_record';
export const MEDAL_CUSTOM_KEY = 'hbr_medal_custom_chars';

// ── Normalize a raw MedalRecord (fills missing cats/jewels) ────
function normalizeMedalRecord(raw: unknown): MedalRecord {
  const out: MedalRecord = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, Partial<CharMedalRecord>>)) {
      const r = v || {};
      out[k] = { cats: r.cats ?? {}, jewels: r.jewels ?? {} };
    }
  }
  return out;
}

function loadLegacyRecord(): MedalRecord {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) return normalizeMedalRecord(JSON.parse(raw));
  } catch { /* ignore */ }
  return {};
}

function loadStore(): MedalRecordsStore {
  try {
    const raw = localStorage.getItem(MEDAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MedalRecordsStore;
      if (parsed && parsed.records && parsed.activeId && parsed.records[parsed.activeId]) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  // Migrate the pre-multi-record single key (hbr_medal_record) into one record
  const id = 'r1';
  const store: MedalRecordsStore = {
    activeId: id,
    records: { [id]: { meta: { id, name: '记录1', createdAt: Date.now() }, data: loadLegacyRecord() } },
  };
  saveStore(store);
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  return store;
}

function saveStore(store: MedalRecordsStore) {
  try {
    localStorage.setItem(MEDAL_STORAGE_KEY, JSON.stringify({ ...store, updatedAt: Date.now() }));
  } catch { /* ignore */ }
}

// Pure read (no migration) — used by the sync engine / export
export function readMedalStore(): MedalRecordsStore | null {
  try {
    const raw = localStorage.getItem(MEDAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MedalRecordsStore;
      if (parsed && parsed.records && parsed.activeId && parsed.records[parsed.activeId]) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function writeMedalStore(store: MedalRecordsStore) {
  saveStore(store);
}

// ── Export / import as JSON ─────────────────────────────────────
export function downloadMedalStore(store: MedalRecordsStore, name = 'hbr-进度记录') {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Merge an imported store into the local one — imported record wins by id, local-only records kept
export function mergeMedalStores(local: MedalRecordsStore, imported: MedalRecordsStore): MedalRecordsStore {
  const records = { ...local.records };
  for (const [id, rec] of Object.entries(imported.records)) records[id] = rec;
  const activeId = records[local.activeId] ? local.activeId : (Object.keys(records)[0] ?? 'r1');
  return { activeId, records };
}

export function loadCustomChars(): MedalCharacter[] {
  try {
    const raw = localStorage.getItem(MEDAL_CUSTOM_KEY);
    if (raw) return JSON.parse(raw) as MedalCharacter[];
  } catch { /* ignore */ }
  return [];
}

function saveCustomChars(list: MedalCharacter[]) {
  try { localStorage.setItem(MEDAL_CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// Update a single character's record inside the ACTIVE record
function updateActiveChar(store: MedalRecordsStore, charId: number, fn: (cur: CharMedalRecord) => CharMedalRecord): MedalRecordsStore {
  const active = store.records[store.activeId];
  const data = active.data;
  const cur = data[String(charId)] || { cats: {}, jewels: {} };
  return {
    ...store,
    records: { ...store.records, [store.activeId]: { ...active, data: { ...data, [String(charId)]: fn(cur) } } },
  };
}

export interface MedalRecordStore {
  records: RecordMeta[];
  activeId: string;
  activeName: string;
  record: MedalRecord;
  setCat: (charId: number, catKey: string, count: number) => void;
  setJewel: (charId: number, jewelIdx: number, value: number) => void;
  setJewelsForChar: (charId: number, jewels: Record<string, number>) => void;
  resetChar: (charId: number) => void;
  customChars: MedalCharacter[];
  addCharacter: (name: string, team: string) => void;
  removeCharacter: (charId: number) => void;
  createRecord: (name?: string) => void;
  switchRecord: (id: string) => void;
  renameRecord: (id: string, name: string) => void;
  deleteRecord: (id: string) => void;
  downloadRecords: () => void;
  importRecords: (imported: MedalRecordsStore) => void;
}

export function useMedalRecords(): MedalRecordStore {
  const [store, setStore] = useState<MedalRecordsStore>(loadStore);
  const [customChars, setCustomChars] = useState<MedalCharacter[]>(loadCustomChars);

  const active = store.records[store.activeId];
  const record = active?.data ?? {};

  const setCat = useCallback((charId: number, catKey: string, count: number) => {
    setStore(prev => {
      const next = updateActiveChar(prev, charId, cur => ({ ...cur, cats: { ...cur.cats, [catKey]: count } }));
      saveStore(next);
      return next;
    });
  }, []);

  const setJewel = useCallback((charId: number, jewelIdx: number, value: number) => {
    setStore(prev => {
      const next = updateActiveChar(prev, charId, cur => ({ ...cur, jewels: { ...cur.jewels, [String(jewelIdx)]: value } }));
      saveStore(next);
      return next;
    });
  }, []);

  const setJewelsForChar = useCallback((charId: number, jewels: Record<string, number>) => {
    setStore(prev => {
      const next = updateActiveChar(prev, charId, cur => ({ ...cur, jewels }));
      saveStore(next);
      return next;
    });
  }, []);

  const resetChar = useCallback((charId: number) => {
    setStore(prev => {
      const active = prev.records[prev.activeId];
      const data = { ...active.data };
      delete data[String(charId)];
      const next = { ...prev, records: { ...prev.records, [prev.activeId]: { ...active, data } } };
      saveStore(next);
      return next;
    });
  }, []);

  const addCharacter = useCallback((name: string, team: string) => {
    setCustomChars(prev => {
      const nextId = prev.length === 0 ? -1 : Math.min(...prev.map(c => c.id)) - 1;
      const next: MedalCharacter[] = [...prev, { id: nextId, name, enName: `Custom${nextId}`, team: team || '其他' }];
      saveCustomChars(next);
      return next;
    });
  }, []);

  const removeCharacter = useCallback((charId: number) => {
    setCustomChars(prev => {
      const next = prev.filter(c => c.id !== charId);
      saveCustomChars(next);
      return next;
    });
    setStore(prev => {
      const active = prev.records[prev.activeId];
      const data = { ...active.data };
      delete data[String(charId)];
      const next = { ...prev, records: { ...prev.records, [prev.activeId]: { ...active, data } } };
      saveStore(next);
      return next;
    });
  }, []);

  const createRecord = useCallback((name?: string) => {
    setStore(prev => {
      const id = `r${Date.now()}`;
      const n = Object.keys(prev.records).length + 1;
      const meta: RecordMeta = { id, name: name?.trim() || `记录${n}`, createdAt: Date.now() };
      const next = { ...prev, activeId: id, records: { ...prev.records, [id]: { meta, data: {} } } };
      saveStore(next);
      return next;
    });
  }, []);

  const switchRecord = useCallback((id: string) => {
    setStore(prev => {
      if (!prev.records[id] || id === prev.activeId) return prev;
      const next = { ...prev, activeId: id };
      saveStore(next);
      return next;
    });
  }, []);

  const renameRecord = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStore(prev => {
      const rec = prev.records[id];
      if (!rec) return prev;
      const next = { ...prev, records: { ...prev.records, [id]: { ...rec, meta: { ...rec.meta, name: trimmed } } } };
      saveStore(next);
      return next;
    });
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setStore(prev => {
      const keys = Object.keys(prev.records);
      if (keys.length <= 1 || !prev.records[id]) return prev; // keep at least one
      const records = { ...prev.records };
      delete records[id];
      const activeId = prev.activeId === id ? Object.keys(records)[0] : prev.activeId;
      const next = { ...prev, activeId, records };
      saveStore(next);
      return next;
    });
  }, []);

  const downloadRecords = useCallback(() => {
    const s = readMedalStore();
    if (s) downloadMedalStore(s);
  }, []);

  const importRecords = useCallback((imported: MedalRecordsStore) => {
    setStore(prev => {
      const merged = mergeMedalStores(prev, imported);
      saveStore(merged);
      return merged;
    });
  }, []);

  return {
    records: Object.values(store.records).map(r => r.meta),
    activeId: store.activeId,
    activeName: active?.meta.name ?? '',
    record,
    setCat, setJewel, setJewelsForChar, resetChar,
    customChars, addCharacter, removeCharacter,
    createRecord, switchRecord, renameRecord, deleteRecord,
    downloadRecords, importRecords,
  };
}
