import { beforeEach, describe, expect, it } from 'vitest';
import { buildDoc } from '../src/model/build';
import {
  StorageError, createMap, deleteMap, duplicateMap, importMap, lastOpened, listMaps, loadMap, renameMap, saveMap, setLastOpened,
} from '../src/storage/maps';

// Minimal in-memory localStorage for the node test environment.
class MemoryStorage {
  data = new Map<string, string>();
  quota = Infinity;
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) {
    const used = [...this.data.values()].reduce((n, x) => n + x.length, 0);
    if (used + v.length > this.quota) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) { this.data.delete(k); }
}
let mem: MemoryStorage;
beforeEach(() => {
  mem = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: mem };
});

const doc = (title: string) => buildDoc({ t: title, c: [{ t: 'a' }, { t: 'b', c: [{ t: 'c' }] }] });

describe('map library', () => {
  it('creates maps with fresh ids, lists them newest first, and loads them back', async () => {
    const one = createMap(doc('One'));
    await new Promise((r) => setTimeout(r, 5));
    const two = createMap(doc('Two'));
    expect(one.id).not.toBe(two.id);
    expect(listMaps().map((m) => [m.title, m.nodes])).toEqual([['Two', 4], ['One', 4]]);
    expect(loadMap(one.id)?.nodes[one.rootId].text).toBe('One');
  });

  it('never lets two creations from the same source collide', () => {
    const src = doc('Same');
    const a = createMap(src);
    const b = createMap(src);
    expect(a.id).not.toBe(b.id);
    expect(listMaps()).toHaveLength(2);
  });

  it('saving updates the list entry (title follows the central node)', () => {
    const m = createMap(doc('Draft'));
    m.nodes[m.rootId].text = 'Final plan\nsecond line';
    m.updatedAt = new Date(Date.now() + 1000).toISOString();
    saveMap(m);
    const [meta] = listMaps();
    expect(meta.title).toBe('Final plan');
    expect(meta.updatedAt).toBe(m.updatedAt);
    expect(meta.createdAt <= meta.updatedAt).toBe(true);
  });

  it('renames, duplicates and deletes', () => {
    const m = createMap(doc('Alpha'));
    renameMap(m.id, '  Beta  ');
    expect(loadMap(m.id)?.nodes[m.rootId].text).toBe('Beta');
    const copy = duplicateMap(m.id)!;
    expect(copy.id).not.toBe(m.id);
    expect(listMaps().map((x) => x.title).sort()).toEqual(['Beta', 'Beta (copy)']);
    setLastOpened(m.id);
    deleteMap(m.id);
    expect(loadMap(m.id)).toBeNull();
    expect(listMaps().map((x) => x.title)).toEqual(['Beta (copy)']);
    expect(lastOpened()).toBeNull();
  });

  it('imports an exported file as a new map and rejects anything else', () => {
    const exported = JSON.stringify(createMap(doc('Shared')));
    const imported = importMap(exported);
    expect(listMaps()).toHaveLength(2);
    expect(imported.nodes[imported.rootId].text).toBe('Shared');
    expect(() => importMap('{nope')).toThrow(StorageError);
    expect(() => importMap('{"hello":1}')).toThrow(/isn’t a Breakdown map/);
  });

  it('moves the old single-map autosave into the library once', () => {
    mem.setItem('mindmap.doc.v1', JSON.stringify(doc('From before')));
    expect(listMaps().map((m) => m.title)).toEqual(['From before']);
    expect(mem.getItem('mindmap.doc.v1')).toBeNull();
    expect(listMaps()).toHaveLength(1);
  });

  it('turns a full browser storage into a clear error', () => {
    createMap(doc('Fits'));
    mem.quota = 10;
    expect(() => createMap(doc('Too big'))).toThrow(/storage is full/);
  });
});
