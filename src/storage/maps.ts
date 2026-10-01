import type { MapDoc } from '../model/types';

/**
 * Your maps, saved in this browser's localStorage (nothing leaves the device).
 *   breakdown.maps.v1     → index: MapMeta[] (for the "My maps" list)
 *   breakdown.map.v1.<id> → one MapDoc per map
 * Each map is stored separately so opening the list never parses every map.
 */

export interface MapMeta {
  id: string;
  title: string;
  nodes: number;
  createdAt: string;
  updatedAt: string;
}

const INDEX = 'breakdown.maps.v1';
const DOC = (id: string) => `breakdown.map.v1.${id}`;
const LAST = 'breakdown.last.v1';
/** The single-map autosave used before the library existed. */
const LEGACY = 'mindmap.doc.v1';

export class StorageError extends Error {}

const store = (): Storage => {
  try {
    return window.localStorage;
  } catch {
    throw new StorageError('This browser is blocking local storage, so maps can’t be saved here.');
  }
};

function write(key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError('Browser storage is full. Export or delete a few maps, then try again.');
  }
}

const read = <T,>(key: string): T | null => {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const newMapId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const titleOf = (doc: MapDoc) => doc.nodes[doc.rootId]?.text.split('\n')[0].trim() || 'Untitled breakdown';
const metaOf = (doc: MapDoc, createdAt: string): MapMeta => ({
  id: doc.id, title: titleOf(doc), nodes: Object.keys(doc.nodes).length, createdAt, updatedAt: doc.updatedAt,
});

export function isMapDoc(x: unknown): x is MapDoc {
  const d = x as MapDoc;
  return !!d && d.version === 1 && typeof d.rootId === 'string' && !!d.nodes?.[d.rootId] && Array.isArray(d.attributes);
}

/** Newest first. */
export function listMaps(): MapMeta[] {
  migrateLegacy();
  return [...(read<MapMeta[]>(INDEX) ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadMap(id: string): MapDoc | null {
  const doc = read<MapDoc>(DOC(id));
  return isMapDoc(doc) ? doc : null;
}

/** Saves the doc and refreshes its entry in the index. */
export function saveMap(doc: MapDoc) {
  const index = read<MapMeta[]>(INDEX) ?? [];
  const i = index.findIndex((m) => m.id === doc.id);
  write(DOC(doc.id), JSON.stringify(doc));
  const meta = metaOf(doc, i >= 0 ? index[i].createdAt : doc.updatedAt);
  if (i >= 0) index[i] = meta;
  else index.push(meta);
  write(INDEX, JSON.stringify(index));
}

/** Stores a copy of `doc` as a new map (fresh id, so it can never overwrite another map). */
export function createMap(doc: MapDoc): MapDoc {
  const now = new Date().toISOString();
  const copy: MapDoc = { ...structuredClone(doc), id: newMapId(), updatedAt: now };
  saveMap(copy);
  return copy;
}

export function duplicateMap(id: string): MapDoc | null {
  const doc = loadMap(id);
  if (!doc) return null;
  const copy = structuredClone(doc);
  copy.nodes[copy.rootId].text = `${titleOf(doc)} (copy)`;
  return createMap(copy);
}

/** The title is the central node's text, so renaming edits that. */
export function renameMap(id: string, title: string) {
  const doc = loadMap(id);
  if (!doc || !title.trim()) return;
  doc.nodes[doc.rootId].text = title.trim();
  doc.updatedAt = new Date().toISOString();
  saveMap(doc);
}

export function deleteMap(id: string) {
  write(INDEX, JSON.stringify((read<MapMeta[]>(INDEX) ?? []).filter((m) => m.id !== id)));
  try { store().removeItem(DOC(id)); } catch { /* already unavailable */ }
  if (lastOpened() === id) setLastOpened(null);
}

/** Parses an exported .json file and stores it as a new map. */
export function importMap(text: string): MapDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StorageError('That file isn’t valid JSON.');
  }
  if (!isMapDoc(parsed)) throw new StorageError('That file isn’t a Breakdown map.');
  return createMap(parsed);
}

export const lastOpened = () => read<string>(LAST);
export const setLastOpened = (id: string | null) => {
  try {
    if (id) write(LAST, JSON.stringify(id));
    else store().removeItem(LAST);
  } catch { /* not critical */ }
};

/** One-time: the map autosaved by earlier versions becomes the first map in the library. */
function migrateLegacy() {
  try {
    const legacy = read<MapDoc>(LEGACY);
    if (!legacy || !isMapDoc(legacy)) return;
    if (!(read<MapMeta[]>(INDEX) ?? []).length) createMap(legacy);
    store().removeItem(LEGACY);
  } catch { /* leave it for next time */ }
}
