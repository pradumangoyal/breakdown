import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { layoutMap } from '../src/views/layout';
import { problemTree, randomTree } from '../poc/01-sheet-layout/samples';

// Deterministic fake sizes: width from text, taller when a node has attributes.
const sizeOf = (doc: ReturnType<typeof randomTree>) => (id: string) => ({
  w: Math.min(260, 20 + doc.nodes[id].text.length * 7),
  h: 26 + (Object.keys(doc.nodes[id].attrs).length ? 18 : 0),
});

describe('layoutMap', () => {
  for (const [n, d, seed] of [[150, 6, 5], [400, 10, 9]] as const) {
    it(`never overlaps two nodes (${n} nodes, depth ${d})`, () => {
      const doc = randomTree(n, d, seed);
      const { boxes } = layoutMap(doc, sizeOf(doc));
      const list = [...boxes.values()];
      expect(list).toHaveLength(n);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
    });
  }

  it('centres a parent on its children and places children to its right', () => {
    const doc = problemTree();
    const { boxes } = layoutMap(doc, sizeOf(doc));
    const content = Object.values(doc.nodes).find((x) => x.text === 'Content issues')!;
    const kids = content.children.map((c) => boxes.get(c)!);
    const p = boxes.get(content.id)!;
    const centre = (bx: { y: number; h: number }) => bx.y + bx.h / 2;
    const mid = (centre(kids[0]) + centre(kids[kids.length - 1])) / 2;
    expect(Math.abs(p.y + p.h / 2 - mid)).toBeLessThan(1);
    for (const k of kids) expect(k.x).toBeGreaterThan(p.x + p.w);
  });

  it('leaves collapsed subtrees out of the layout', () => {
    const doc = produce(problemTree(), (d) => {
      Object.values(d.nodes).find((x) => x.text === 'Content issues')!.collapsed = true;
    });
    expect(layoutMap(doc, sizeOf(doc)).boxes.size).toBe(3);
  });
});
