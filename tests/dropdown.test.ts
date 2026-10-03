import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import ExcelJS from 'exceljs';
import { buildDoc } from '../src/model/build';
import { addAttribute, cleanOptions, updateAttribute } from '../src/model/tree';
import { treeToGrid } from '../src/export/grid';
import { gridToSheets } from '../src/export/sheets';
import { gridToWorkbook } from '../src/export/xlsx';
import { wbs } from '../src/samples';

describe('dropdown attributes', () => {
  it('cleans choices: trims, drops blanks and duplicates, keeps order', () => {
    expect(cleanOptions([' To do', 'WIP', '', 'wip', 'Done ', 'To do'])).toEqual(['To do', 'WIP', 'Done']);
  });

  it('stores choices only for dropdowns and keeps values when the type changes', () => {
    let doc = buildDoc({ t: 'R', c: [{ t: 'A' }] });
    let id = '';
    doc = produce(doc, (d) => { id = addAttribute(d, 'Status', 'select', undefined, ['To do', 'Done', 'Done']); });
    expect(doc.attributes[0]).toMatchObject({ type: 'select', options: ['To do', 'Done'] });
    doc = produce(doc, (d) => { d.nodes[d.nodes[d.rootId].children[0]].attrs[id] = 'Done'; });
    doc = produce(doc, (d) => updateAttribute(d, id, { type: 'text' }));
    expect(doc.attributes[0].options).toBeUndefined();
    expect(doc.nodes[doc.nodes[doc.rootId].children[0]].attrs[id]).toBe('Done');
  });

  it('marks dropdown columns in the grid', () => {
    const status = treeToGrid(wbs()).columns.find((c) => c.header === 'Status');
    expect(status?.options).toEqual(['To do', 'WIP', 'Done', 'Blocked']);
  });

  it('becomes a dropdown (data validation) in the Google Sheet', () => {
    const grid = treeToGrid(wbs());
    const col = grid.columns.findIndex((c) => c.header === 'Status');
    const rule = gridToSheets(grid).requests.find((r) => 'setDataValidation' in r) as any;
    expect(rule.setDataValidation.range).toMatchObject({ startColumnIndex: col, endColumnIndex: col + 1, startRowIndex: grid.dataStart });
    expect(rule.setDataValidation.rule.condition).toEqual({
      type: 'ONE_OF_LIST',
      values: ['To do', 'WIP', 'Done', 'Blocked'].map((v) => ({ userEnteredValue: v })),
    });
  });

  it('becomes a list validation in the .xlsx, with long lists on a hidden sheet', async () => {
    const grid = treeToGrid(wbs());
    const col = grid.columns.findIndex((c) => c.header === 'Status');
    const ws = gridToWorkbook(grid).worksheets[0];
    expect(ws.getCell(grid.dataStart + 1, col + 1).dataValidation).toMatchObject({ type: 'list', formulae: ['"To do,WIP,Done,Blocked"'] });

    const long = buildDoc({ t: 'R', c: [{ t: 'A' }] }, {
      attributes: [{ name: 'Pick', type: 'select', options: Array.from({ length: 60 }, (_, i) => `Option number ${i}`) }],
    });
    long.nodes[long.nodes[long.rootId].children[0]].attrs[long.attributes[0].id] = 'Option number 1';
    const wb = gridToWorkbook(treeToGrid(long));
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    expect(back.getWorksheet('Lists')?.state).toBe('hidden');
    expect(back.worksheets[0].getCell(3, 2).dataValidation.formulae).toEqual(['Lists!$A$1:$A$60']);
  });
});
