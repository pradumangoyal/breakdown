import type { Grid, GridCell } from './grid';

/**
 * Grid → Google Sheets API payloads.
 *  1. `create`: spreadsheets.create body with values, merges, frozen rows and column widths.
 *  2. `requests`: one spreadsheets.batchUpdate with range-level formatting (repeatCell /
 *     updateBorders), which keeps the payload small instead of formatting every cell.
 */

const SHEET_ID = 0;
const GREY = { red: 0.72, green: 0.74, blue: 0.77 };
const HEAD_BG = { red: 0.93, green: 0.94, blue: 0.95 };
const META_FG = { red: 0.33, green: 0.36, blue: 0.4 };
/** Spare rows/columns so the Sheet can keep growing after it takes over. */
const SPARE_ROWS = 50;
const SPARE_COLS = 5;

type Json = Record<string, unknown>;

const range = (r0: number, r1: number, c0: number, c1: number) => ({
  sheetId: SHEET_ID, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1,
});

function cellData(cell: GridCell): Json {
  if (cell.value === null || cell.kind === 'covered') return {};
  // stringValue is always literal: "=SUM(…)" or "+91…" stays text, never a formula.
  return typeof cell.value === 'number'
    ? { userEnteredValue: { numberValue: cell.value } }
    : { userEnteredValue: { stringValue: cell.value } };
}

export interface SheetsPayload {
  create: Json;
  requests: Json[];
}

export function gridToSheets(grid: Grid): SheetsPayload {
  const H = grid.rows.length;
  const W = Math.max(grid.columns.length, 1);

  const rowData = grid.rows.map((row) => {
    const values = row.map(cellData);
    while (values.length && Object.keys(values[values.length - 1]).length === 0) values.pop();
    return { values };
  });

  const create = {
    properties: { title: grid.title },
    sheets: [
      {
        properties: {
          sheetId: SHEET_ID,
          title: 'Breakdown',
          gridProperties: { rowCount: H + SPARE_ROWS, columnCount: W + SPARE_COLS, frozenRowCount: grid.frozenRows },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData,
            columnMetadata: grid.columns.map((c) => ({ pixelSize: c.width })),
          },
        ],
        merges: grid.merges.map((m) => range(m.r0, m.r1 + 1, m.c0, m.c1 + 1)),
      },
    ],
  };

  const requests: Json[] = [
    {
      repeatCell: {
        range: range(0, H, 0, W),
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
      },
    },
    {
      repeatCell: {
        range: range(0, 1, 0, W),
        cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', textFormat: { bold: true, fontSize: 14 } } },
        fields: 'userEnteredFormat(verticalAlignment,textFormat)',
      },
    },
    { updateDimensionProperties: { range: { sheetId: SHEET_ID, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
  ];

  const metaRow = grid.rows.findIndex((r) => r[0]?.kind === 'meta');
  if (metaRow >= 0) {
    requests.push({
      repeatCell: {
        range: range(metaRow, metaRow + 1, 0, W),
        cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: META_FG } } },
        fields: 'userEnteredFormat(textFormat)',
      },
    });
  }

  const headerRow = grid.rows.findIndex((r) => r[0]?.kind === 'header');
  if (headerRow >= 0) {
    requests.push({
      repeatCell: {
        range: range(headerRow, headerRow + 1, 0, W),
        cell: { userEnteredFormat: { backgroundColor: HEAD_BG, textFormat: { bold: true } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
    const border = { style: 'SOLID', color: GREY };
    requests.push({
      updateBorders: {
        range: range(headerRow, H, 0, W),
        top: border, bottom: border, left: border, right: border, innerHorizontal: border, innerVertical: border,
      },
    });
  }

  return { create, requests };
}
