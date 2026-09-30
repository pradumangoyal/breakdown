import type { MapDoc } from '../model/types';

/**
 * Left-to-right tree layout. Each subtree is a horizontal band as tall as its
 * visible nodes need; a parent sits midway between its first and last child. One O(n) pass.
 */

export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

export interface MapLayout {
  boxes: Map<string, Box>;
  edges: Array<{ from: string; to: string }>;
  /** Index of the top-level branch each node belongs to (root = -1), for colouring. */
  branch: Map<string, number>;
  depth: Map<string, number>;
  width: number;
  height: number;
}

const H_GAP = 56;
/** Tight between end nodes, looser around subtrees so branches read as groups. */
const LEAF_GAP = 6;
const GROUP_GAP = 16;
const PAD = 60;

export function layoutMap(doc: MapDoc, sizeOf: (id: string, depth: number) => Size): MapLayout {
  const boxes = new Map<string, Box>();
  const edges: MapLayout['edges'] = [];
  const branch = new Map<string, number>();
  const depth = new Map<string, number>();
  const sizes = new Map<string, Size>();
  /** Per subtree: total height, the node's own centre, and each child's offset (all from the subtree's top). */
  const sub = new Map<string, { height: number; anchor: number; offsets: number[] }>();
  const kids = (id: string) => (doc.nodes[id].collapsed ? [] : doc.nodes[id].children);
  const isLeaf = (id: string) => kids(id).length === 0;
  const gap = (k: string[], i: number) => (i === 0 ? 0 : isLeaf(k[i - 1]) && isLeaf(k[i]) ? LEAF_GAP : GROUP_GAP);

  const measure = (id: string, d: number) => {
    const size = sizeOf(id, d);
    sizes.set(id, size);
    depth.set(id, d);
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

  let maxX = 0;
  const place = (id: string, x: number, top: number, b: number) => {
    const { w, h } = sizes.get(id)!;
    const s = sub.get(id)!;
    boxes.set(id, { x, y: top + s.anchor - h / 2, w, h });
    branch.set(id, b);
    maxX = Math.max(maxX, x + w);
    kids(id).forEach((c, i) => {
      edges.push({ from: id, to: c });
      place(c, x + w + H_GAP, top + s.offsets[i], b === -1 ? i : b);
    });
  };
  place(doc.rootId, PAD, PAD, -1);

  return { boxes, edges, branch, depth, width: maxX + PAD, height: sub.get(doc.rootId)!.height + PAD * 2 };
}
