import { describe, expect, it } from 'vitest';
import { buildDoc } from '../src/model/build';
import { describeScope, scopeTester } from '../src/model/scope';
import type { AttrScope, MapDoc } from '../src/model/types';
import { treeToGrid, type Grid } from '../src/export/grid';
import { gridToSheets } from '../src/export/sheets';

/*
  R
  ├ Content            (L1, parent)
  │ ├ Too long         (L2, end)
  │ └ Outdated         (L2, parent)
  │   └ Old tools      (L3, end)
  └ Learner            (L1, end)
*/
const tree = (attributes: Array<{ name: string; scope?: AttrScope }>, values: Record<string, Record<string, string>> = {}) =>
  buildDoc(
    {
      t: 'R', a: values.R,
      c: [
        { t: 'Content', a: values.Content, c: [{ t: 'Too long', a: values['Too long'] }, { t: 'Outdated', a: values.Outdated, c: [{ t: 'Old tools', a: values['Old tools'] }] }] },
        { t: 'Learner', a: values.Learner },
      ],
    },
    { attributes },
  );
const id = (doc: MapDoc, text: string) => Object.values(doc.nodes).find((n) => n.text === text)!.id;
const appliesTo = (doc: MapDoc, attrName: string) => {
  const test = scopeTester(doc);
  const attr = doc.attributes.find((a) => a.name === attrName)!;
  return Object.values(doc.nodes).filter((n) => test(attr, n.id)).map((n) => n.text).sort();
};
const headers = (g: Grid) => g.columns.map((c) => c.header);
const column = (g: Grid, header: string) => {
  const c = headers(g).indexOf(header);
  return g.rows.slice(g.dataStart).map((r) => (r[c].kind === 'covered' ? '┃' : r[c].kind === 'na' ? 'n/a' : r[c].value ?? '·'));
};

describe('scopeTester', () => {
  it('all nodes includes the centre; end nodes excludes it and every parent', () => {
    const doc = tree([{ name: 'A' }, { name: 'E', scope: { nodes: 'end' } }]);
    expect(appliesTo(doc, 'A')).toEqual(['Content', 'Learner', 'Old tools', 'Outdated', 'R', 'Too long']);
    expect(appliesTo(doc, 'E')).toEqual(['Learner', 'Old tools', 'Too long']);
  });

  it('levels pick depths, with 0 meaning the central node', () => {
    const doc = tree([{ name: 'L', scope: { nodes: 'levels', levels: [0, 2] } }]);
    expect(appliesTo(doc, 'L')).toEqual(['Outdated', 'R', 'Too long']);
  });

  it('a branch means that node and everything under it, and combines with the node rule', () => {
    const doc = tree([]);
    const content = id(doc, 'Content');
    doc.attributes.push(
      { id: 'b1', name: 'Inside', type: 'text', scope: { nodes: 'all', within: content } },
      { id: 'b2', name: 'InsideEnds', type: 'text', scope: { nodes: 'end', within: content } },
      { id: 'b3', name: 'Gone', type: 'text', scope: { nodes: 'all', within: 'deleted-node' } },
    );
    expect(appliesTo(doc, 'Inside')).toEqual(['Content', 'Old tools', 'Outdated', 'Too long']);
    expect(appliesTo(doc, 'InsideEnds')).toEqual(['Old tools', 'Too long']);
    expect(appliesTo(doc, 'Gone')).toEqual([]);
  });

  it('describes scopes in plain words', () => {
    const doc = tree([{ name: 'A' }, { name: 'E', scope: { nodes: 'end' } }, { name: 'L', scope: { nodes: 'levels', levels: [2, 0] } }]);
    doc.levelNames = ['Theme'];
    doc.attributes.push({ id: 'w', name: 'W', type: 'text', scope: { nodes: 'end', within: id(doc, 'Content') } });
    expect(doc.attributes.map((a) => describeScope(doc, a))).toEqual([
      'All nodes', 'End nodes', 'Central node, Level 2', 'End nodes inside “Content”',
    ]);
  });
});

describe('treeToGrid with scoped attributes', () => {
  it('gives end-node attributes their column even before anything is filled in', () => {
    const g = treeToGrid(tree([{ name: 'Status', scope: { nodes: 'end' } }]));
    expect(headers(g)).toEqual(['Level 1', 'Level 2', 'Level 3', 'Status']);
    expect(column(g, 'Status')).toEqual(['·', '·', '·']);
  });

  it('gives level attributes a column beside each level where an in-scope parent exists', () => {
    const g = treeToGrid(tree([{ name: 'Owner', scope: { nodes: 'levels', levels: [1, 2] } }]));
    // Level 1 parent: Content; Level 2 parent: Outdated. End nodes at those levels get no eager column.
    expect(headers(g)).toEqual(['Level 1', 'Level 1 · Owner', 'Level 2', 'Level 2 · Owner', 'Level 3']);
  });

  it('greys out cells where the attribute does not apply', () => {
    const doc = tree([]);
    doc.attributes.push({ id: 's', name: 'Status', type: 'text', scope: { nodes: 'end', within: id(doc, 'Content') } });
    const g = treeToGrid(doc);
    expect(column(g, 'Status')).toEqual(['·', '·', 'n/a']); // Too long, Old tools, Learner (outside Content)
    const sheet = (gridToSheets(g).create as any).sheets[0];
    const na = sheet.data[0].rowData.flatMap((r: any) => r.values).filter((v: any) => v.userEnteredFormat?.backgroundColor);
    expect(na).toHaveLength(1);
  });

  it('leaves out values on nodes outside the scope, with a warning', () => {
    const g = treeToGrid(tree(
      [{ name: 'Status', scope: { nodes: 'end' } }],
      { Content: { Status: 'stale, Content now has children' }, R: { Status: 'x' }, 'Too long': { Status: 'Done' } },
    ));
    expect(headers(g)).not.toContain('Level 1 · Status');
    expect(column(g, 'Status')).toEqual(['Done', '·', '·']);
    expect(g.rows[1][0].kind).toBe('header'); // no meta row: the centre's Status is out of scope
    expect(g.warnings.join()).toMatch(/2 value\(s\) were left out/);
  });

  it('keeps "all nodes" attributes value-driven: no values, no column', () => {
    expect(headers(treeToGrid(tree([{ name: 'Notes' }])))).toEqual(['Level 1', 'Level 2', 'Level 3']);
  });
});
