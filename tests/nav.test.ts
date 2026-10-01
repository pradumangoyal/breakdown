import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildDoc } from '../src/model/build';
import { nextLogical, prevLogical } from '../src/model/tree';
import type { MapDoc } from '../src/model/types';

/*
  R
  ├ A
  │ ├ A1
  │ │ ├ a1x
  │ │ └ a1y      ← last L3 under A1
  │ ├ A2         ← has no L3 children
  │ └ A3
  │   └ a3x
  └ B
    └ B1
      └ b1x
*/
const doc = buildDoc({
  t: 'R',
  c: [
    { t: 'A', c: [{ t: 'A1', c: [{ t: 'a1x' }, { t: 'a1y' }] }, { t: 'A2' }, { t: 'A3', c: [{ t: 'a3x' }] }] },
    { t: 'B', c: [{ t: 'B1', c: [{ t: 'b1x' }] }] },
  ],
});
const id = (d: MapDoc, t: string) => Object.values(d.nodes).find((n) => n.text === t)!.id;
const text = (d: MapDoc, x: string | null) => (x ? d.nodes[x].text : null);
const down = (d: MapDoc, t: string) => text(d, nextLogical(d, id(d, t)));
const up = (d: MapDoc, t: string) => text(d, prevLogical(d, id(d, t)));

describe('logical ↓ / ↑ on the map', () => {
  it('goes to the next sibling first', () => {
    expect(down(doc, 'a1x')).toBe('a1y');
    expect(up(doc, 'a1y')).toBe('a1x');
  });

  it('from the last child, stops at the next parent when it has nothing at this level', () => {
    expect(down(doc, 'a1y')).toBe('A2');
  });

  it('otherwise lands on the next parent’s first node at the same level, across branches', () => {
    expect(down(doc, 'A2')).toBe('A3');
    expect(down(doc, 'a3x')).toBe('b1x'); // A3 → (no next sibling) → B → B1 → b1x
  });

  it('↑ mirrors it, ending at the parent when nothing is above', () => {
    expect(up(doc, 'a3x')).toBe('A2'); // A2 has nothing at L3
    expect(up(doc, 'A2')).toBe('A1');
    expect(up(doc, 'b1x')).toBe('a3x');
    expect(up(doc, 'a1x')).toBe('A1'); // top of the chain
    expect(up(doc, 'A')).toBe('R');
  });

  it('stays put at the very bottom and respects collapsed branches', () => {
    expect(down(doc, 'b1x')).toBeNull();
    const collapsed = produce(doc, (d) => { d.nodes[id(d, 'A3')].collapsed = true; });
    expect(down(collapsed, 'A2')).toBe('A3');
    expect(up(collapsed, 'b1x')).toBe('A3'); // a3x is hidden
  });
});
