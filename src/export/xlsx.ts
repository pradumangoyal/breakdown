import ExcelJS from 'exceljs';
import type { Grid } from './grid';

const THIN = { style: 'thin' as const, color: { argb: 'FFB7BCC4' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

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
  return wb;
}
