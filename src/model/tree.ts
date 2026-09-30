import type { AttrDef, AttrValue, MapDoc } from './types';

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
export function addAttribute(doc: MapDoc, name: string, type: AttrDef['type'] = 'text'): string {
  const clean = name.trim();
  const existing = doc.attributes.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const id = `a${Math.random().toString(36).slice(2, 8)}`;
  doc.attributes.push({ id, name: clean, type });
  return id;
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
