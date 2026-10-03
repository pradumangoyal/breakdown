import ExcelJS from 'exceljs';
import type { Grid } from './grid';

const THIN = { style: 'thin' as const, color: { argb: 'FFB7BCC4' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * Dropdown attributes → list validation on their cells. Short lists are written inline
 * ("To do,WIP,Done"); long lists or choices containing commas go on a hidden "Lists" sheet.
 */
function addDropdowns(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, grid: Grid) {
  let lists: ExcelJS.Worksheet | null = null;
  let listCol = 0;
  grid.columns.forEach((col, c) => {
    const options = col.options;
    if (!options?.length) return;
    const inline = `"${options.join(',').replace(/"/g, '""')}"`;
    let formula = inline;
    if (inline.length > 250 || options.some((o) => o.includes(','))) {
      lists ??= wb.addWorksheet('Lists', { state: 'hidden' });
      listCol++;
      options.forEach((o, i) => { lists!.getCell(i + 1, listCol).value = o; });
      const letter = lists.getColumn(listCol).letter;
      formula = `Lists!$${letter}$1:$${letter}$${options.length}`;
    }
    for (let r = grid.dataStart; r < grid.rows.length; r++) {
      const kind = grid.rows[r][c].kind;
      if (kind === 'covered' || kind === 'na') continue;
      ws.getCell(r + 1, c + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: false };
    }
  });
}

/** Grid → .xlsx workbook (fallback export; also used to check the layout in real Sheets). */
export function gridToWorkbook(grid: Grid): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Breakdown', {
    views: [{ state: 'frozen', ySplit: grid.frozenRows, xSplit: 0 }],
  });
  ws.columns = grid.columns.map((c) => ({ width: Math.round(c.width / 7) }));

  grid.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const x = ws.getCell(r + 1, c + 1);
      // Strings are written as plain strings, never as formulas, so "=foo" stays text.
      if (cell.value !== null && cell.kind !== 'covered') x.value = cell.value;
      x.alignment = { wrapText: true, vertical: cell.kind === 'title' ? 'middle' : 'top' };
      if (cell.kind === 'title') x.font = { bold: true, size: 14 };
      if (cell.kind === 'meta') x.font = { italic: true, color: { argb: 'FF555B66' } };
      if (cell.kind === 'na') x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F4' } };
      if (cell.kind === 'header') {
        x.font = { bold: true };
        x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F3' } };
      }
      if (cell.kind === 'header' || r >= grid.dataStart) x.border = BORDER;
    });
  });
  if (grid.rows[0]) ws.getRow(1).height = 24;
  for (const m of grid.merges) ws.mergeCells(m.r0 + 1, m.c0 + 1, m.r1 + 1, m.c1 + 1);
  addDropdowns(wb, ws, grid);
  return wb;
}
