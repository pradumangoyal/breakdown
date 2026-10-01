import type { AttrDef, AttrScope, MapDoc } from './types';

export const ALL_NODES: AttrScope = { nodes: 'all' };
export const scopeOf = (a: AttrDef): AttrScope => a.scope ?? ALL_NODES;

/** Header used for a level in the Sheet (custom name or "Level n"). */
export function levelName(doc: MapDoc, level: number): string {
  return doc.levelNames[level - 1]?.trim() || `Level ${level}`;
}
export const levelLabel = (doc: MapDoc, level: number) => (level === 0 ? 'Central node' : levelName(doc, level));

/**
 * Builds a fast "does this attribute apply to this node?" test for the current tree.
 * Rebuild it whenever the doc changes (it caches depths and branch membership).
 */
export function scopeTester(doc: MapDoc): (attr: AttrDef, nodeId: string) => boolean {
  const depth = new Map<string, number>();
  const walk = (id: string, d: number) => {
    depth.set(id, d);
    for (const c of doc.nodes[id].children) walk(c, d + 1);
  };
  walk(doc.rootId, 0);

  const branches = new Map<string, Set<string>>();
  const inside = (branchId: string) => {
    let set = branches.get(branchId);
    if (!set) {
      set = new Set();
      const add = (id: string) => { set!.add(id); for (const c of doc.nodes[id].children) add(c); };
      if (doc.nodes[branchId] && depth.has(branchId)) add(branchId);
      branches.set(branchId, set);
    }
    return set;
  };

  return (attr, id) => {
    const d = depth.get(id);
    if (d === undefined) return false;
    const s = scopeOf(attr);
    if (s.within && !inside(s.within).has(id)) return false;
    if (s.nodes === 'end') return d > 0 && doc.nodes[id].children.length === 0;
    if (s.nodes === 'levels') return (s.levels ?? []).includes(d);
    return true;
  };
}

/** Short human description, e.g. "End nodes inside “Marketing”". */
export function describeScope(doc: MapDoc, attr: AttrDef): string {
  const s = scopeOf(attr);
  const what =
    s.nodes === 'end' ? 'End nodes'
    : s.nodes === 'levels' ? ([...(s.levels ?? [])].sort((a, b) => a - b).map((l) => levelLabel(doc, l)).join(', ') || 'No levels')
    : 'All nodes';
  if (!s.within) return what;
  const branch = doc.nodes[s.within];
  if (!branch) return `${what} inside a deleted branch`;
  const name = branch.text.trim() || 'Untitled';
  return `${what} inside “${name.length > 24 ? `${name.slice(0, 23)}…` : name}”`;
}
