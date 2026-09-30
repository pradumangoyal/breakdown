import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDoc } from '../src/model/build';
import { treeToGrid, type Grid } from '../src/export/grid';
import { gridToWorkbook } from '../src/export/xlsx';
import { problemTree, randomTree, wbs } from '../poc/01-sheet-layout/samples';

/** Text picture of a grid: ┃ = merged down, ═ = merged across, · = empty. */
function picture(grid: Grid): string[][] {
  return grid.rows.map((row, r) =>
    row.map((cell, c) => {
      if (cell.kind === 'covered') {
        const m = grid.merges.find((m) => r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1)!;
        return c === m.c0 ? '┃' : '═';
      }
      return cell.value === null ? '·' : String(cell.value);
    }),
  );
}

describe('treeToGrid — spec example (problem tree)', () => {
  const grid = treeToGrid(problemTree());

  it('matches the layout agreed in the plan', () => {
    expect(picture(grid)).toEqual([
      ['Why is course completion low?', '═', '═', '═', '═', '═'],
      ['Level 1', 'Level 1 · Owner', 'Level 2', 'Level 3', 'Owner', 'Notes'],
      ['Content issues', 'Riya', 'Too long', '═', 'Riya', 'avg 42m'],
      ['┃', '┃', 'Outdated', 'Old tools used', 'Aman', '·'],
      ['┃', '┃', '┃', 'No real projects', 'Aman', '·'],
      ['Learner issues', '═', '═', '═', 'Neha', '·'],
    ]);
    expect(grid.title).toBe('Why is course completion low?');
    expect(grid.frozenRows).toBe(2);
  });

  it('keeps a mid-node attribute and an end-node attribute with the same name in separate columns', () => {
    expect(grid.columns.map((c) => c.kind)).toEqual(['level', 'midAttr', 'level', 'level', 'leafAttr', 'leafAttr']);
  });
});

describe('treeToGrid — edge cases', () => {
  it('only creates attribute columns at the levels where they are used', () => {
    const headers = treeToGrid(wbs()).columns.map((c) => c.header);
    expect(headers).toContain('Level 2 · Budget (₹k)');
    expect(headers).not.toContain('Level 1 · Budget (₹k)');
    expect(headers).not.toContain('Budget (₹k)');
    expect(headers).toContain('Level 1 · Owner');
    expect(headers).not.toContain('Owner');
  });

  it('handles chains of single children without vertical merges', () => {
    const grid = treeToGrid(buildDoc({ t: 'R', c: [{ t: 'A', c: [{ t: 'B', c: [{ t: 'C' }] }] }] }));
    expect(picture(grid).slice(2)).toEqual([['A', 'B', 'C']]);
    expect(grid.merges).toHaveLength(1); // title only
  });

  it('warns and produces only a title when the root has no branches', () => {
    const grid = treeToGrid(buildDoc({ t: 'Just an idea' }));
    expect(picture(grid)).toEqual([['Just an idea']]);
    expect(grid.warnings[0]).toMatch(/no branches/);
  });

  it('puts root attributes in a meta row under the title', () => {
    const grid = treeToGrid(wbs());
    expect(grid.rows[1][0]).toMatchObject({ kind: 'meta', value: 'Sponsor: Academics head  ·  Deadline: 15 Dec' });
    expect(grid.frozenRows).toBe(3);
    expect(grid.columns.map((c) => c.header)).not.toContain('Sponsor');
  });

  it('exports collapsed subtrees', () => {
    const grid = treeToGrid(buildDoc({ t: 'R', c: [{ t: 'A', collapsed: true, c: [{ t: 'x' }, { t: 'y' }] }] }));
    expect(picture(grid).slice(2)).toEqual([['A', 'x'], ['┃', 'y']]);
  });

  it('keeps empty and multi-line text, and warns about empty nodes', () => {
    const grid = treeToGrid(buildDoc({ t: 'R', c: [{ t: '' }, { t: 'line 1\nline 2' }] }));
    expect(picture(grid).slice(2)).toEqual([[''], ['line 1\nline 2']]);
    expect(grid.warnings.join()).toMatch(/1 node has no text/);
  });

  it('keeps formula-looking text as plain strings, also in the .xlsx', async () => {
    const doc = buildDoc({ t: 'R', c: [{ t: '=SUM(A1:A3)', a: { Note: '+91 98765' } }, { t: '-minus' }] });
    const grid = treeToGrid(doc);
    expect(grid.rows[2][0].value).toBe('=SUM(A1:A3)');
    const buf = await gridToWorkbook(grid).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const cell = wb.worksheets[0].getCell(3, 1);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe('=SUM(A1:A3)');
  });

  it('writes number attributes as numbers and text attributes as text', () => {
    const doc = buildDoc(
      { t: 'R', c: [{ t: 'A', a: { Effort: '12', Code: '007' } }] },
      { attributes: [{ name: 'Effort', type: 'number' }, { name: 'Code' }] },
    );
    const row = treeToGrid(doc).rows[2];
    expect(row[1].value).toBe(12);
    expect(row[2].value).toBe('007');
  });

  it('prefixes outline numbers when numbering is on', () => {
    const doc = buildDoc({ t: 'R', c: [{ t: 'A', c: [{ t: 'x' }, { t: 'y' }] }, { t: 'B' }] }, { numbering: true });
    expect(picture(treeToGrid(doc)).slice(2)).toEqual([['1 A', '1.1 x'], ['┃', '1.2 y'], ['2 B', '═']]);
  });

  it('uses custom level names in headers', () => {
    const doc = buildDoc({ t: 'R', c: [{ t: 'A', a: { Owner: 'x' }, c: [{ t: 'b' }] }] }, { levelNames: ['Theme', 'Cause'] });
    expect(treeToGrid(doc).columns.map((c) => c.header)).toEqual(['Theme', 'Theme · Owner', 'Cause']);
  });

  it('skips values of deleted attributes with a warning', () => {
    const doc = buildDoc({ t: 'R', c: [{ t: 'A' }] });
    doc.nodes[doc.nodes[doc.rootId].children[0]].attrs.gone = 'x';
    const grid = treeToGrid(doc);
    expect(grid.columns).toHaveLength(1);
    expect(grid.warnings.join()).toMatch(/deleted attribute/);
  });
});

describe('treeToGrid — invariants on random trees', () => {
  for (const [n, depth, seed] of [[30, 4, 1], [200, 6, 2], [1000, 10, 7], [1000, 10, 99]] as const) {
    it(`holds for ${n} nodes, depth ≤ ${depth}, seed ${seed}`, () => {
      const doc = randomTree(n, depth, seed);
      const grid = treeToGrid(doc);
      const H = grid.rows.length;
      const W = grid.columns.length;

      // Merges are in bounds and never overlap; covered cells are exactly the non-anchor cells of merges.
      const owner = new Map<string, number>();
      grid.merges.forEach((m, i) => {
        expect(m.r0 >= 0 && m.c0 >= 0 && m.r1 < H && m.c1 < W && m.r0 <= m.r1 && m.c0 <= m.c1).toBe(true);
        for (let r = m.r0; r <= m.r1; r++)
          for (let c = m.c0; c <= m.c1; c++) {
            const key = `${r}:${c}`;
            expect(owner.has(key)).toBe(false);
            owner.set(key, i);
            expect(grid.rows[r][c].kind === 'covered').toBe(r !== m.r0 || c !== m.c0);
          }
      });
      grid.rows.forEach((row, r) => row.forEach((cell, c) => {
        if (cell.kind === 'covered') expect(owner.has(`${r}:${c}`)).toBe(true);
      }));

      // Every non-root node appears exactly once; one data row per end node.
      const nodeCells = grid.rows.flat().filter((c) => c.kind === 'node').map((c) => c.nodeId);
      const nonRoot = Object.keys(doc.nodes).filter((id) => id !== doc.rootId);
      expect(new Set(nodeCells).size).toBe(nonRoot.length);
      expect(nodeCells).toHaveLength(nonRoot.length);
      const leaves = nonRoot.filter((id) => doc.nodes[id].children.length === 0);
      expect(H - grid.dataStart).toBe(leaves.length);

      // Level columns never have gaps inside the tree.
      const levelCols = grid.columns.flatMap((c, i) => (c.kind === 'level' ? [i] : []));
      for (let r = grid.dataStart; r < H; r++) for (const c of levelCols) expect(grid.rows[r][c].kind).not.toBe('empty');
    });
  }

  it('converts 1,000 nodes at depth 10 in under 100 ms', () => {
    const doc = randomTree(1000, 10, 7);
    treeToGrid(doc); // warm-up
    const t = performance.now();
    treeToGrid(doc);
    expect(performance.now() - t).toBeLessThan(100);
  });
});
