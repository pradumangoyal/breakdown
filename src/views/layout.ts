import type { MapDoc } from '../model/types';

/**
 * Left-to-right tree layout. Each subtree is a horizontal band as tall as its
 * visible nodes need; a parent sits midway between its first and last child. One O(n) pass.
 *
 * With `alignLevels`, every node of the same level starts at the same x (one column per
 * level, like the Sheet). Otherwise each child sits a fixed gap right of its own parent.
 */

export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

export interface MapLayout {
  boxes: Map<string, Box>;
  edges: Array<{ from: string; to: string }>;
  parent: Map<string, string | null>;
  /** Index of the top-level branch each node belongs to (root = -1), for colouring. */
  branch: Map<string, number>;
  depth: Map<string, number>;
  /** Left x of each level's column (index = depth); only meaningful with `alignLevels`. */
  columns: number[];
  width: number;
  height: number;
}

export const H_GAP = 56;
/** Tight between end nodes, looser around subtrees so branches read as groups. */
const LEAF_GAP = 6;
const GROUP_GAP = 16;
export const PAD = 60;

export function layoutMap(doc: MapDoc, sizeOf: (id: string, depth: number) => Size, opts: { alignLevels?: boolean } = {}): MapLayout {
  const boxes = new Map<string, Box>();
  const edges: MapLayout['edges'] = [];
  const parent = new Map<string, string | null>();
  const branch = new Map<string, number>();
  const depth = new Map<string, number>();
  const sizes = new Map<string, Size>();
  const widest: number[] = [];
  /** Per subtree: total height, the node's own centre, and each child's offset (all from the subtree's top). */
  const sub = new Map<string, { height: number; anchor: number; offsets: number[] }>();
  const kids = (id: string) => (doc.nodes[id].collapsed ? [] : doc.nodes[id].children);
  const isLeaf = (id: string) => kids(id).length === 0;
  const gap = (k: string[], i: number) => (i === 0 ? 0 : isLeaf(k[i - 1]) && isLeaf(k[i]) ? LEAF_GAP : GROUP_GAP);

  const measure = (id: string, d: number) => {
    const size = sizeOf(id, d);
    sizes.set(id, size);
    depth.set(id, d);
    widest[d] = Math.max(widest[d] ?? 0, size.w);
    const k = kids(id);
    if (!k.length) {
      sub.set(id, { height: size.h, anchor: size.h / 2, offsets: [] });
      return;
    }
    // Stack child subtrees, then centre this node between its first and last child.
    const offsets: number[] = [];
    let y = 0;
    k.forEach((c, i) => {
      measure(c, d + 1);
      y += gap(k, i);
      offsets.push(y);
      y += sub.get(c)!.height;
    });
    const first = offsets[0] + sub.get(k[0])!.anchor;
    const last = offsets[k.length - 1] + sub.get(k[k.length - 1])!.anchor;
    const centre = (first + last) / 2;
    // The node itself may stick out above/below its children; grow the subtree to fit it.
    const top = Math.min(0, centre - size.h / 2);
    const bottom = Math.max(y, centre + size.h / 2);
    sub.set(id, { height: bottom - top, anchor: centre - top, offsets: offsets.map((o) => o - top) });
  };
  measure(doc.rootId, 0);

  const columns: number[] = [PAD];
  for (let d = 1; d < widest.length; d++) columns[d] = columns[d - 1] + widest[d - 1] + H_GAP;

  let maxX = 0;
  const place = (id: string, x: number, top: number, b: number, d: number) => {
    const { w, h } = sizes.get(id)!;
    const s = sub.get(id)!;
    boxes.set(id, { x, y: top + s.anchor - h / 2, w, h });
    branch.set(id, b);
    maxX = Math.max(maxX, x + w);
    kids(id).forEach((c, i) => {
      edges.push({ from: id, to: c });
      parent.set(c, id);
      const cx = opts.alignLevels ? columns[d + 1] : x + w + H_GAP;
      place(c, cx, top + s.offsets[i], b === -1 ? i : b, d + 1);
    });
  };
  parent.set(doc.rootId, null);
  place(doc.rootId, PAD, PAD, -1, 0);

  return { boxes, edges, parent, branch, depth, columns, width: maxX + PAD, height: sub.get(doc.rootId)!.height + PAD * 2 };
}
