import { describe, expect, it } from 'vitest';
import { treeToGrid } from '../src/export/grid';
import { gridToHtml } from '../src/export/html';
import { wbs } from '../src/samples';

describe('editable Sheet view', () => {
  const doc = wbs();
  const grid = treeToGrid(doc);
  const html = gridToHtml(grid);
  const statusId = doc.attributes.find((a) => a.name === 'Status')!.id;

  it('every attribute cell in scope knows its node and attribute, even when empty', () => {
    const statusCol = grid.columns.findIndex((c) => c.header === 'Status');
    const cells = grid.rows.slice(grid.dataStart).map((r) => r[statusCol]).filter((c) => c.kind !== 'covered');
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      if (c.kind === 'na') expect(c.attrId).toBeUndefined();
      else expect([c.nodeId && doc.nodes[c.nodeId] ? 'ok' : 'missing', c.attrId]).toEqual(['ok', statusId]);
    }
  });

  it('marks node text, attribute values, the title and level headers as editable — and nothing else', () => {
    expect(html).toContain(`data-edit data-node="${doc.rootId}"`); // title = central node
    expect(html).toMatch(/<th [^>]*data-edit data-level="1"/);
    expect(html).toContain(`data-attr="${statusId}"`);
    const editable = html.match(/data-edit/g)!.length;
    const nodes = Object.keys(doc.nodes).length; // every node, incl. the centre (title)
    const levels = grid.columns.filter((c) => c.kind === 'level').length;
    const attrCells = grid.rows.flat().filter((c) => c.attrId).length;
    expect(editable).toBe(nodes + levels + attrCells);
    expect(html).not.toMatch(/class="k-na[^"]*" data-edit/);
  });
});
