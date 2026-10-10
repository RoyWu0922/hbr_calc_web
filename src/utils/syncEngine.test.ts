import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression tests for the "云端有新记录，是否更新？" dialog that used to fire while
// nothing new existed. The old implementation compared the cloud's newest
// timestamp against `localStorage.hbr_last_sync` — a wall-clock mark written when
// the local sync finished. Those are different clocks (a second device running a
// few minutes ahead, or an upload that re-stamped rows without refreshing the
// mark), so the cloud looked permanently one step newer and the dialog kept
// coming back. Detection now compares cloud-observed stamps against
// cloud-observed stamps and must be idempotent once the data has been reconciled.

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  uid: 'user-1',
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: h.uid } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const pass = () => chain;
      chain.select = pass;
      chain.eq = pass;
      chain.order = pass;
      chain.limit = pass;
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: h.rows[table] ?? [], error: null }).then(res);
      return chain;
    },
  },
}));
vi.mock('idb', () => ({ openDB: vi.fn() }));
vi.mock('./medalStorage', () => ({
  MEDAL_CUSTOM_KEY: 'hbr_medal_custom_chars',
  readMedalStore: () => null,
  writeMedalStore: () => {},
}));

const { checkCloudChanges, markCloudDeclined } = await import('./syncEngine');

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  for (const k of Object.keys(h.rows)) delete h.rows[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
  });
});

const cloud = (table: string, stamp: number, col = 'timestamp') =>
  ({ [table]: [{ [col]: stamp }] });

describe('checkCloudChanges', () => {
  it('reports a table the device has never reconciled', async () => {
    Object.assign(h.rows, cloud('calc_history', 1_000));
    const changes = await checkCloudChanges();
    expect(changes.map(c => c.table)).toEqual(['calc_history']);
    expect(changes[0].label).toBe('伤害历史');
    expect(changes[0].ts).toBe(1_000);
  });

  it('stays quiet once the stamp has been offered and declined', async () => {
    Object.assign(h.rows, cloud('calc_history', 1_000));
    const first = await checkCloudChanges();
    expect(first).toHaveLength(1);

    await markCloudDeclined(first);

    // Would previously re-fire on every 2-minute tick for the same data.
    expect(await checkCloudChanges()).toEqual([]);
    expect(await checkCloudChanges()).toEqual([]);
  });

  it('reports again as soon as the cloud really grows', async () => {
    Object.assign(h.rows, cloud('calc_history', 1_000));
    await markCloudDeclined(await checkCloudChanges());
    expect(await checkCloudChanges()).toEqual([]);

    Object.assign(h.rows, cloud('calc_history', 2_000));
    const again = await checkCloudChanges();
    expect(again.map(c => c.ts)).toEqual([2_000]);
  });

  it('ignores a cloud stamp older than one already handled (no clock involved)', async () => {
    // A device whose clock is *behind* rewrites its rows with a smaller stamp.
    // The watermark never moves backwards, so this must not surface.
    Object.assign(h.rows, cloud('calc_history', 5_000));
    await markCloudDeclined(await checkCloudChanges());

    Object.assign(h.rows, cloud('calc_history', 4_000));
    expect(await checkCloudChanges()).toEqual([]);
  });

  it('tracks each table independently, including the updated_at ones', async () => {
    Object.assign(h.rows, {
      ...cloud('calc_history', 100),
      ...cloud('medal_records', 900, 'updated_at'),
    });
    const changes = await checkCloudChanges();
    expect(changes.map(c => c.table).sort()).toEqual(['calc_history', 'medal_records']);

    await markCloudDeclined(changes);
    expect(await checkCloudChanges()).toEqual([]);

    Object.assign(h.rows, { ...cloud('calc_history', 100), ...cloud('medal_records', 901, 'updated_at') });
    const next = await checkCloudChanges();
    expect(next.map(c => c.table)).toEqual(['medal_records']);
  });

  it('ignores tables with no cloud rows at all', async () => {
    expect(await checkCloudChanges()).toEqual([]);
  });
});
