import { describe, expect, it } from 'vitest';
import { treeToGrid } from '../src/export/grid';
import { gridToSheets } from '../src/export/sheets';
import { edgeCases, problemTree, randomTree } from '../src/samples';

const sheetOf = (p: ReturnType<typeof gridToSheets>) => (p.create as any).sheets[0];

describe('gridToSheets', () => {
  it('maps merges to half-open GridRanges and freezes the title + header rows', () => {
    const grid = treeToGrid(problemTree());
    const sheet = sheetOf(gridToSheets(grid));
    expect(sheet.merges).toHaveLength(grid.merges.length);
    expect(sheet.merges[0]).toEqual({ sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 });
    expect(sheet.properties.gridProperties.frozenRowCount).toBe(2);
    expect((gridToSheets(grid).create as any).properties.title).toBe('Why is course completion low?');
  });

  it('sends formula-looking text as literal stringValue and numbers as numberValue', () => {
    const sheet = sheetOf(gridToSheets(treeToGrid(edgeCases())));
    const values = sheet.data[0].rowData.flatMap((r: any) => r.values).map((v: any) => v.userEnteredValue).filter(Boolean);
    expect(values).toContainEqual({ stringValue: '=SUM(A1:A3)' });
    expect(values).toContainEqual({ stringValue: '+91 98765 43210' });
    expect(values).toContainEqual({ numberValue: 42 });
    expect(values.some((v: any) => 'formulaValue' in v)).toBe(false);
  });

  it('keeps a 1,000-node export well under 1 MB', () => {
    const p = gridToSheets(treeToGrid(randomTree(1000, 10, 7)));
    const bytes = JSON.stringify(p.create).length + JSON.stringify({ requests: p.requests }).length;
    expect(bytes).toBeLessThan(1_000_000);
    console.log(`1,000-node payload: ${(bytes / 1024).toFixed(0)} KB`);
  });
});
