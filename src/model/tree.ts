import type { AttrDef, AttrScope, AttrValue, MapDoc } from './types';

/**
 * Pure tree operations. They mutate the doc passed in (use them inside an immer
 * producer) and return the id that should be selected afterwards, if any.
 */

export const newId = () => `n${Math.random().toString(36).slice(2, 10)}`;

export function parentOf(doc: MapDoc, id: string): string | null {
  for (const n of Object.values(doc.nodes)) if (n.children.includes(id)) return n.id;
  return null;
}

export interface TreeIndex {
  parent: Map<string, string | null>;
  depth: Map<string, number>;
  /** Depth-first order of nodes whose ancestors are all expanded (root first). */
  visible: string[];
}

export function indexTree(doc: MapDoc): TreeIndex {
  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const visible: string[] = [];
  const walk = (id: string, p: string | null, d: number, shown: boolean) => {
    parent.set(id, p);
    depth.set(id, d);
    if (shown) visible.push(id);
    const n = doc.nodes[id];
    for (const c of n.children) walk(c, id, d + 1, shown && !n.collapsed);
  };
  walk(doc.rootId, null, 0, true);
  return { parent, depth, visible };
}

export function countDescendants(doc: MapDoc, id: string): number {
  return doc.nodes[id].children.reduce((sum, c) => sum + 1 + countDescendants(doc, c), 0);
}

function createNode(doc: MapDoc, text = ''): string {
  const id = newId();
  doc.nodes[id] = { id, text, children: [], collapsed: false, attrs: {} };
  return id;
}

export function addChild(doc: MapDoc, parentId: string, index?: number, text = ''): string {
  const id = createNode(doc, text);
  const p = doc.nodes[parentId];
  p.children.splice(index ?? p.children.length, 0, id);
  p.collapsed = false;
  return id;
}

/** New node right after `id`. On the root, adds its first child instead. */
export function addSiblingAfter(doc: MapDoc, id: string): string {
  const p = parentOf(doc, id);
  if (!p) return addChild(doc, id, 0);
  return addChild(doc, p, doc.nodes[p].children.indexOf(id) + 1);
}

/** Becomes the last child of the previous sibling. */
export function indent(doc: MapDoc, id: string): boolean {
  const p = parentOf(doc, id);
  if (!p) return false;
  const siblings = doc.nodes[p].children;
  const i = siblings.indexOf(id);
  if (i <= 0) return false;
  const newParent = doc.nodes[siblings[i - 1]];
  siblings.splice(i, 1);
  newParent.children.push(id);
  newParent.collapsed = false;
  return true;
}

/** Becomes the sibling right after its parent. */
export function outdent(doc: MapDoc, id: string): boolean {
  const p = parentOf(doc, id);
  const g = p && parentOf(doc, p);
  if (!p || !g) return false;
  doc.nodes[p].children.splice(doc.nodes[p].children.indexOf(id), 1);
  const gc = doc.nodes[g].children;
  gc.splice(gc.indexOf(p) + 1, 0, id);
  return true;
}

export function moveAmongSiblings(doc: MapDoc, id: string, delta: -1 | 1): boolean {
  const p = parentOf(doc, id);
  if (!p) return false;
  const s = doc.nodes[p].children;
  const i = s.indexOf(id);
  const j = i + delta;
  if (j < 0 || j >= s.length) return false;
  [s[i], s[j]] = [s[j], s[i]];
  return true;
}

/** Deletes the node and its subtree; returns the node to select next (previous visible node). */
export function remove(doc: MapDoc, id: string): string | null {
  const p = parentOf(doc, id);
  if (!p) return null;
  const { visible } = indexTree(doc);
  const prev = visible[visible.indexOf(id) - 1] ?? p;
  const drop = (x: string) => {
    for (const c of doc.nodes[x].children) drop(c);
    delete doc.nodes[x];
  };
  doc.nodes[p].children.splice(doc.nodes[p].children.indexOf(id), 1);
  drop(id);
  return doc.nodes[prev] ? prev : p;
}

export function setText(doc: MapDoc, id: string, text: string) {
  doc.nodes[id].text = text;
}

export function setCollapsed(doc: MapDoc, id: string, collapsed: boolean) {
  const n = doc.nodes[id];
  if (n.children.length || !collapsed) n.collapsed = collapsed;
}

export function setAttr(doc: MapDoc, id: string, attrId: string, value: AttrValue | undefined) {
  const attrs = doc.nodes[id].attrs;
  if (value === undefined || value === '') delete attrs[attrId];
  else attrs[attrId] = value;
}

/** Registers an attribute (or returns the existing one with the same name). */
export function addAttribute(doc: MapDoc, name: string, type: AttrDef['type'] = 'text', scope?: AttrScope): string {
  const clean = name.trim();
  const existing = doc.attributes.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const id = `a${Math.random().toString(36).slice(2, 8)}`;
  doc.attributes.push(scope ? { id, name: clean, type, scope } : { id, name: clean, type });
  return id;
}

/** Rename / retype / rescope. Values are kept even if some nodes fall out of scope. */
export function updateAttribute(doc: MapDoc, id: string, patch: Partial<Omit<AttrDef, 'id'>>) {
  const a = doc.attributes.find((x) => x.id === id);
  if (!a) return;
  if (patch.name !== undefined && patch.name.trim()) a.name = patch.name.trim();
  if (patch.type) a.type = patch.type;
  if (patch.scope) a.scope = patch.scope;
}

/** Deletes the attribute and its values on every node. */
export function removeAttribute(doc: MapDoc, id: string) {
  doc.attributes = doc.attributes.filter((a) => a.id !== id);
  for (const n of Object.values(doc.nodes)) delete n.attrs[id];
}

/** Moves an attribute one place left/right in the column order. */
export function moveAttribute(doc: MapDoc, id: string, delta: -1 | 1) {
  const i = doc.attributes.findIndex((a) => a.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.attributes.length) return;
  [doc.attributes[i], doc.attributes[j]] = [doc.attributes[j], doc.attributes[i]];
}

export function blankDoc(title = 'New breakdown'): MapDoc {
  const rootId = newId();
  return {
    id: `m${Math.random().toString(36).slice(2, 10)}`,
    version: 1,
    rootId,
    nodes: { [rootId]: { id: rootId, text: title, children: [], collapsed: false, attrs: {} } },
    attributes: [],
    levelNames: [],
    settings: { numbering: false },
    updatedAt: new Date().toISOString(),
  };
}

/** Children shown on screen (none while collapsed). */
const shownKids = (doc: MapDoc, id: string) => (doc.nodes[id].collapsed ? [] : doc.nodes[id].children);

/**
 * ↓ on the map: the next logical node below, staying at the same level where possible.
 * Next sibling if there is one; otherwise the next branch's first node at this level,
 * or that branch's own node if it has nothing at this level. Null at the very bottom.
 */
export function nextLogical(doc: MapDoc, id: string): string | null {
  const { parent, depth } = indexTree(doc);
  const d = depth.get(id) ?? 0;
  let cur = id;
  let next: string | null = null;
  while (!next) {
    const p = parent.get(cur);
    if (!p) return null;
    const sib = doc.nodes[p].children;
    const i = sib.indexOf(cur);
    if (i < sib.length - 1) next = sib[i + 1];
    else cur = p;
  }
  while ((depth.get(next) ?? 0) < d && shownKids(doc, next).length) next = shownKids(doc, next)[0];
  return next;
}

/** ↑ on the map: mirror of `nextLogical`; at the top of a chain it goes to the parent. */
export function prevLogical(doc: MapDoc, id: string): string | null {
  const { parent, depth } = indexTree(doc);
  const d = depth.get(id) ?? 0;
  let cur = id;
  let prev: string | null = null;
  while (!prev) {
    const p = parent.get(cur);
    if (!p) return parent.get(id) ?? null;
    const sib = doc.nodes[p].children;
    const i = sib.indexOf(cur);
    if (i > 0) prev = sib[i - 1];
    else if (p === doc.rootId) return parent.get(id) ?? null; // nothing above at all
    else cur = p;
  }
  while ((depth.get(prev) ?? 0) < d && shownKids(doc, prev).length) {
    const k = shownKids(doc, prev);
    prev = k[k.length - 1];
  }
  return prev;
}

/** True if `id` is `ancestor` or somewhere inside its subtree. */
export function isInside(doc: MapDoc, id: string, ancestor: string): boolean {
  if (id === ancestor) return true;
  return doc.nodes[ancestor].children.some((c) => isInside(doc, id, c));
}

/**
 * Moves a node (with its subtree) to `index` among `parentId`'s children.
 * Refuses moves into its own subtree and moves of the root. Returns whether anything moved.
 */
export function moveNode(doc: MapDoc, id: string, parentId: string, index: number): boolean {
  if (id === doc.rootId || !doc.nodes[parentId] || isInside(doc, parentId, id)) return false;
  const from = parentOf(doc, id);
  if (!from) return false;
  const old = doc.nodes[from].children;
  const oldIndex = old.indexOf(id);
  // Same parent: removing the node first shifts later positions by one.
  let at = Math.max(0, Math.min(index, doc.nodes[parentId].children.length));
  if (from === parentId && oldIndex < at) at--;
  if (from === parentId && oldIndex === at) return false;
  old.splice(oldIndex, 1);
  doc.nodes[parentId].children.splice(at, 0, id);
  doc.nodes[parentId].collapsed = false;
  return true;
}

export type DropZone = 'before' | 'after' | 'inside';

/** Where a drop lands: above / below the target as a sibling, or as its last child. Null if not allowed. */
export function dropPosition(doc: MapDoc, dragId: string, targetId: string, zone: DropZone): { parent: string; index: number } | null {
  if (!doc.nodes[targetId] || !doc.nodes[dragId] || isInside(doc, targetId, dragId)) return null;
  if (zone === 'inside') return { parent: targetId, index: doc.nodes[targetId].children.length };
  const parent = parentOf(doc, targetId);
  if (!parent) return null; // nothing goes beside the central node
  const i = doc.nodes[parent].children.indexOf(targetId);
  return { parent, index: zone === 'before' ? i : i + 1 };
}
