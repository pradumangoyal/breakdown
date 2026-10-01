import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildDoc } from '../src/model/build';
import type { MapDoc } from '../src/model/types';
import {
  addAttribute, addChild, addSiblingAfter, countDescendants, indent, indexTree,
  dropPosition, moveAmongSiblings, moveNode, outdent, remove, setAttr, setCollapsed,
} from '../src/model/tree';
import { randomTree } from '../src/samples';

/** Outline as indented text, e.g. "R\n  A\n    x". */
const outline = (doc: MapDoc) => {
  const lines: string[] = [];
  const walk = (id: string, d: number) => {
    lines.push(`${'  '.repeat(d)}${doc.nodes[id].text}`);
    doc.nodes[id].children.forEach((c) => walk(c, d + 1));
  };
  walk(doc.rootId, 0);
  return lines.join('\n');
};
const idOf = (doc: MapDoc, text: string) => Object.values(doc.nodes).find((n) => n.text === text)!.id;
const sample = () => buildDoc({ t: 'R', c: [{ t: 'A', c: [{ t: 'a1' }, { t: 'a2' }] }, { t: 'B' }, { t: 'C' }] });

describe('tree operations', () => {
  it('adds a sibling after a node, or a first child on the root', () => {
    let doc = sample();
    doc = produce(doc, (d) => { d.nodes[addSiblingAfter(d, idOf(d, 'B'))].text = 'B2'; });
    doc = produce(doc, (d) => { d.nodes[addSiblingAfter(d, d.rootId)].text = 'first'; });
    expect(outline(doc)).toBe('R\n  first\n  A\n    a1\n    a2\n  B\n  B2\n  C');
  });

  it('indents under the previous sibling and expands it', () => {
    let doc = produce(sample(), (d) => { d.nodes[idOf(d, 'A')].collapsed = true; });
    doc = produce(doc, (d) => { expect(indent(d, idOf(d, 'B'))).toBe(true); });
    expect(outline(doc)).toBe('R\n  A\n    a1\n    a2\n    B\n  C');
    expect(doc.nodes[idOf(doc, 'A')].collapsed).toBe(false);
    // first child cannot indent
    produce(doc, (d) => { expect(indent(d, idOf(d, 'a1'))).toBe(false); });
  });

  it('outdents to right after the parent; top level cannot outdent', () => {
    const doc = produce(sample(), (d) => { expect(outdent(d, idOf(d, 'a1'))).toBe(true); });
    expect(outline(doc)).toBe('R\n  A\n    a2\n  a1\n  B\n  C');
    produce(doc, (d) => { expect(outdent(d, idOf(d, 'B'))).toBe(false); });
  });

  it('moves among siblings and stops at the ends', () => {
    const doc = produce(sample(), (d) => {
      expect(moveAmongSiblings(d, idOf(d, 'C'), -1)).toBe(true);
      expect(moveAmongSiblings(d, idOf(d, 'A'), -1)).toBe(false);
    });
    expect(outline(doc)).toBe('R\n  A\n    a1\n    a2\n  C\n  B');
  });

  it('removes a subtree and selects the previous visible node', () => {
    let next: string | null = null;
    const doc = produce(sample(), (d) => { next = remove(d, idOf(d, 'B')); });
    expect(outline(doc)).toBe('R\n  A\n    a1\n    a2\n  C');
    expect(doc.nodes[next!].text).toBe('a2');
    expect(Object.keys(doc.nodes)).toHaveLength(5);
    const doc2 = produce(sample(), (d) => { remove(d, idOf(d, 'A')); });
    expect(Object.keys(doc2.nodes)).toHaveLength(3);
    produce(sample(), (d) => { expect(remove(d, d.rootId)).toBeNull(); });
  });

  it('hides collapsed children from the visible order only', () => {
    const doc = produce(sample(), (d) => setCollapsed(d, idOf(d, 'A'), true));
    expect(indexTree(doc).visible.map((id) => doc.nodes[id].text)).toEqual(['R', 'A', 'B', 'C']);
    expect(countDescendants(doc, idOf(doc, 'A'))).toBe(2);
    // leaves can't be collapsed
    const doc2 = produce(doc, (d) => setCollapsed(d, idOf(d, 'B'), true));
    expect(doc2.nodes[idOf(doc2, 'B')].collapsed).toBe(false);
  });

  it('adding a child expands a collapsed parent', () => {
    const collapsed = produce(sample(), (d) => setCollapsed(d, idOf(d, 'A'), true));
    const doc = produce(collapsed, (d: MapDoc) => { addChild(d, idOf(d, 'A')); });
    expect(doc.nodes[idOf(doc, 'A')].collapsed).toBe(false);
  });

  it('reuses attributes by name and clears empty values', () => {
    const doc = produce(sample(), (d) => {
      const a = addAttribute(d, 'Owner');
      expect(addAttribute(d, ' owner ')).toBe(a);
      setAttr(d, idOf(d, 'B'), a, 'Riya');
      setAttr(d, idOf(d, 'C'), a, 'x');
      setAttr(d, idOf(d, 'C'), a, '');
    });
    expect(doc.attributes).toHaveLength(1);
    expect(doc.nodes[idOf(doc, 'B')].attrs).toEqual({ [doc.attributes[0].id]: 'Riya' });
    expect(doc.nodes[idOf(doc, 'C')].attrs).toEqual({});
  });

  it('keeps the tree valid under a long random sequence of operations', () => {
    let doc = randomTree(200, 6, 3);
    let s = 11;
    const rand = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31) % n);
    for (let step = 0; step < 2000; step++) {
      const ids = Object.keys(doc.nodes);
      const id = ids[rand(ids.length)];
      doc = produce(doc, (d) => {
        switch (rand(6)) {
          case 0: addSiblingAfter(d, id); break;
          case 1: addChild(d, id); break;
          case 2: indent(d, id); break;
          case 3: outdent(d, id); break;
          case 4: moveAmongSiblings(d, id, rand(2) ? 1 : -1); break;
          case 5: if (Object.keys(d.nodes).length > 20) remove(d, id); break;
        }
      });
      if (step % 100 === 0) {
        // every node reachable exactly once from the root, nothing orphaned
        const seen = new Set<string>();
        const walk = (x: string) => { expect(seen.has(x)).toBe(false); seen.add(x); doc.nodes[x].children.forEach(walk); };
        walk(doc.rootId);
        expect(seen.size).toBe(Object.keys(doc.nodes).length);
      }
    }
  }, 30_000); // ~1 s normally; generous so a busy machine doesn't flake it
});

describe('moveNode (drag and drop)', () => {
  const run = (fn: (d: MapDoc) => boolean) => {
    let ok = false;
    const doc = produce(sample(), (d) => { ok = fn(d); });
    return { ok, out: outline(doc) };
  };

  it('moves a node under another parent, with its subtree', () => {
    const { ok, out } = run((d) => moveNode(d, idOf(d, 'A'), idOf(d, 'C'), 0));
    expect(ok).toBe(true);
    expect(out).toBe('R\n  B\n  C\n    A\n      a1\n      a2');
  });

  it('reorders within the same parent, accounting for the removed slot', () => {
    expect(run((d) => moveNode(d, idOf(d, 'A'), d.rootId, 2)).out).toBe('R\n  B\n  A\n    a1\n    a2\n  C'); // drop between B and C
    expect(run((d) => moveNode(d, idOf(d, 'C'), d.rootId, 0)).out).toBe('R\n  C\n  A\n    a1\n    a2\n  B');
    expect(run((d) => moveNode(d, idOf(d, 'A'), d.rootId, 1)).ok).toBe(false); // dropped where it already is
  });

  it('refuses to move a node into its own branch, or to move the root', () => {
    expect(run((d) => moveNode(d, idOf(d, 'A'), idOf(d, 'a1'), 0)).ok).toBe(false);
    expect(run((d) => moveNode(d, idOf(d, 'A'), idOf(d, 'A'), 0)).ok).toBe(false);
    expect(run((d) => moveNode(d, d.rootId, idOf(d, 'B'), 0)).ok).toBe(false);
  });

  it('expands a collapsed target so the moved node stays visible', () => {
    const doc = produce(sample(), (d) => { d.nodes[idOf(d, 'A')].collapsed = true; moveNode(d, idOf(d, 'B'), idOf(d, 'A'), 0); });
    expect(doc.nodes[idOf(doc, 'A')].collapsed).toBe(false);
  });
});

describe('dropPosition', () => {
  it('maps drop zones to a parent and index, and refuses impossible drops', () => {
    const d = sample();
    const B = idOf(d, 'B');
    expect(dropPosition(d, idOf(d, 'C'), B, 'before')).toEqual({ parent: d.rootId, index: 1 });
    expect(dropPosition(d, idOf(d, 'C'), B, 'after')).toEqual({ parent: d.rootId, index: 2 });
    expect(dropPosition(d, idOf(d, 'C'), B, 'inside')).toEqual({ parent: B, index: 0 });
    expect(dropPosition(d, idOf(d, 'A'), idOf(d, 'a1'), 'inside')).toBeNull(); // into its own branch
    expect(dropPosition(d, idOf(d, 'A'), d.rootId, 'before')).toBeNull();     // beside the centre
    expect(dropPosition(d, idOf(d, 'A'), d.rootId, 'inside')).toEqual({ parent: d.rootId, index: 3 });
  });
});
