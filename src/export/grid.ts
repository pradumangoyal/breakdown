import type { AttrDef, AttrValue, MapDoc, Node } from '../model/types';
import { levelName, scopeOf, scopeTester } from '../model/scope';

export { levelName };

/**
 * Tree → spreadsheet layout. Pure; shared by the in-app preview, the Google
 * Sheets exporter and the .xlsx fallback so all three show the same thing.
 *
 * Layout rules (see plan):
 *  - root → title row (merged across); root attributes → one meta row
 *  - one data row per end node (leaf), depth-first order
 *  - a node with children spans its leaves' rows (merged down)
 *  - an end node shallower than the deepest one merges rightward to the last level column
 *  - attributes of nodes with children → column right after that level, merged down
 *  - attributes of end nodes → columns after the last level column
 *  - an attribute only fills cells of nodes in its scope; where it doesn't apply the cell is grey ('na').
 *    Scoped attributes (end nodes / levels) get their columns even while empty, so the team can fill
 *    them in the Sheet; "all nodes" attributes only get columns where a value exists.
 */

export type CellKind = 'title' | 'meta' | 'header' | 'node' | 'attr' | 'empty' | 'na' | 'covered';

export interface GridCell {
  value: AttrValue | null;
  kind: CellKind;
  /** Level (1-based) for node cells and mid-node attribute cells. */
  depth?: number;
  nodeId?: string;
}

/** Inclusive, 0-based. */
export interface Merge {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface GridColumn {
  kind: 'level' | 'midAttr' | 'leafAttr';
  level?: number;
  attrId?: string;
  header: string;
  /** Pixels. */
  width: number;
}

export interface Grid {
  title: string;
  columns: GridColumn[];
  rows: GridCell[][];
  merges: Merge[];
  /** Title (+ meta) + header rows. */
  frozenRows: number;
  /** Index of the first data row. */
  dataStart: number;
  warnings: string[];
}

const LEVEL_WIDTH = 220;
const ATTR_WIDTH = 140;

interface Placed {
  node: Node;
  depth: number;
  first: number;
  last: number;
  code: string;
  isLeaf: boolean;
}

const hasValue = (v: AttrValue | undefined): v is AttrValue =>
  v !== undefined && !(typeof v === 'string' && v.trim() === '');

function coerce(def: AttrDef, v: AttrValue): AttrValue {
  if (def.type === 'number' && typeof v === 'string') {
    const n = Number(v.trim());
    if (v.trim() !== '' && Number.isFinite(n)) return n;
  }
  return v;
}

export function treeToGrid(doc: MapDoc): Grid {
  const warnings: string[] = [];
  const root = doc.nodes[doc.rootId];
  if (!root) throw new Error(`Root node ${doc.rootId} not found`);
  const defs = new Map(doc.attributes.map((a) => [a.id, a]));
  const applies = scopeTester(doc);
  const unknownAttrs = new Set<string>();
  let outOfScope = 0;

  // 1. Walk the tree: depth, leaf row range, outline code.
  const placed: Placed[] = [];
  let leafCount = 0;
  let emptyText = 0;
  const seen = new Set<string>();
  const walk = (id: string, depth: number, code: string): [number, number] => {
    const node = doc.nodes[id];
    if (!node) throw new Error(`Node ${id} not found`);
    if (seen.has(id)) throw new Error(`Node ${id} appears twice in the tree`);
    seen.add(id);
    if (depth > 0 && node.text.trim() === '') emptyText++;
    for (const key of Object.keys(node.attrs)) if (!defs.has(key)) unknownAttrs.add(key);

    const entry: Placed = { node, depth, first: 0, last: 0, code, isLeaf: node.children.length === 0 };
    if (depth > 0) placed.push(entry);
    if (entry.isLeaf) {
      // A root without branches is not a row.
      entry.first = entry.last = depth > 0 ? leafCount++ : 0;
    } else {
      const ranges = node.children.map((c, i) => walk(c, depth + 1, code ? `${code}.${i + 1}` : `${i + 1}`));
      entry.first = ranges[0][0];
      entry.last = ranges[ranges.length - 1][1];
    }
    return [entry.first, entry.last];
  };
  walk(doc.rootId, 0, '');

  const hasChildren = root.children.length > 0;
  const maxDepth = hasChildren ? Math.max(...placed.filter((p) => p.isLeaf).map((p) => p.depth)) : 0;
  if (!hasChildren) warnings.push('The central node has no branches yet, so there is nothing to put in the table.');
  if (emptyText) warnings.push(`${emptyText} node${emptyText > 1 ? 's have' : ' has'} no text.`);
  if (unknownAttrs.size) warnings.push(`${unknownAttrs.size} attribute value(s) refer to a deleted attribute and were skipped.`);

  // 2. Which attributes get columns, and where.
  const midUsed: Array<Set<string>> = Array.from({ length: maxDepth + 1 }, () => new Set());
  const leafUsed = new Set<string>();
  for (const p of placed) {
    for (const def of doc.attributes) {
      const inScope = applies(def, p.node.id);
      const filled = hasValue(p.node.attrs[def.id]);
      if (filled && !inScope) outOfScope++;
      const scope = scopeOf(def).nodes;
      // Eager columns: end-node attributes for in-scope end nodes, level attributes for in-scope parents.
      const eager = inScope && ((scope === 'end' && p.isLeaf) || (scope === 'levels' && !p.isLeaf));
      if ((filled && inScope) || eager) (p.isLeaf ? leafUsed : midUsed[p.depth]).add(def.id);
    }
  }
  for (const def of doc.attributes) if (hasValue(root.attrs[def.id]) && !applies(def, root.id)) outOfScope++;
  if (outOfScope) warnings.push(`${outOfScope} value(s) were left out because their node is outside the attribute’s scope.`);

  const columns: GridColumn[] = [];
  const levelCol: number[] = [];
  const midCol: Array<Map<string, number>> = [];
  for (let d = 1; d <= maxDepth; d++) {
    levelCol[d] = columns.length;
    columns.push({ kind: 'level', level: d, header: levelName(doc, d), width: LEVEL_WIDTH });
    midCol[d] = new Map();
    for (const def of doc.attributes) {
      if (!midUsed[d].has(def.id)) continue;
      midCol[d].set(def.id, columns.length);
      columns.push({ kind: 'midAttr', level: d, attrId: def.id, header: `${levelName(doc, d)} · ${def.name}`, width: ATTR_WIDTH });
    }
  }
  const leafCol = new Map<string, number>();
  for (const def of doc.attributes) {
    if (!leafUsed.has(def.id)) continue;
    leafCol.set(def.id, columns.length);
    columns.push({ kind: 'leafAttr', attrId: def.id, header: def.name, width: ATTR_WIDTH });
  }
  const width = Math.max(columns.length, 1);

  // 3. Title, meta and header rows.
  const rows: GridCell[][] = [];
  const merges: Merge[] = [];
  const fullRow = (value: string, kind: CellKind) => {
    const r = rows.length;
    rows.push(Array.from({ length: width }, (_, c) => (c === 0 ? { value, kind } : { value: null, kind: 'covered' as const })));
    if (width > 1) merges.push({ r0: r, c0: 0, r1: r, c1: width - 1 });
  };
  const title = root.text.trim() || 'Untitled breakdown';
  fullRow(title, 'title');

  const rootMeta = doc.attributes
    .filter((def) => hasValue(root.attrs[def.id]) && applies(def, root.id))
    .map((def) => `${def.name}: ${root.attrs[def.id]}`);
  if (rootMeta.length) fullRow(rootMeta.join('  ·  '), 'meta');

  if (hasChildren) rows.push(columns.map((col) => ({ value: col.header, kind: 'header' })));
  const dataStart = rows.length;

  // 4. Data rows.
  for (let i = 0; i < leafCount; i++) rows.push(Array.from({ length: width }, () => ({ value: null, kind: 'empty' })));

  const put = (r0: number, c0: number, r1: number, c1: number, cell: GridCell) => {
    const R0 = dataStart + r0;
    const R1 = dataStart + r1;
    rows[R0][c0] = cell;
    for (let r = R0; r <= R1; r++) for (let c = c0; c <= c1; c++) if (r !== R0 || c !== c0) rows[r][c] = { value: null, kind: 'covered' };
    if (R1 > R0 || c1 > c0) merges.push({ r0: R0, c0, r1: R1, c1 });
  };

  for (const p of placed) {
    const text = doc.settings.numbering ? `${p.code} ${p.node.text}` : p.node.text;
    const nodeCell: GridCell = { value: text, kind: 'node', depth: p.depth, nodeId: p.node.id };
    const col = levelCol[p.depth];
    if (p.isLeaf) {
      put(p.first, col, p.first, levelCol[maxDepth], nodeCell);
      for (const [attrId, c] of leafCol) {
        const def = defs.get(attrId)!;
        const v = p.node.attrs[attrId];
        if (!applies(def, p.node.id)) rows[dataStart + p.first][c] = { value: null, kind: 'na' };
        else if (hasValue(v)) rows[dataStart + p.first][c] = { value: coerce(def, v), kind: 'attr', nodeId: p.node.id };
      }
    } else {
      put(p.first, col, p.last, col, nodeCell);
      for (const [attrId, c] of midCol[p.depth]) {
        const def = defs.get(attrId)!;
        const v = p.node.attrs[attrId];
        put(p.first, c, p.last, c,
          !applies(def, p.node.id) ? { value: null, kind: 'na', depth: p.depth }
          : hasValue(v) ? { value: coerce(def, v), kind: 'attr', depth: p.depth, nodeId: p.node.id }
          : { value: null, kind: 'empty', depth: p.depth });
      }
    }
  }

  return { title, columns, rows, merges, frozenRows: dataStart, dataStart, warnings };
}
