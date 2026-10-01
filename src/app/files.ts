import type { MapDoc } from '../model/types';
import { treeToGrid } from '../export/grid';

export function downloadBlob(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fileName = (doc: MapDoc) => (doc.nodes[doc.rootId].text.split('\n')[0].trim() || 'breakdown').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'breakdown';

export const downloadJson = (doc: MapDoc) => downloadBlob(JSON.stringify(doc, null, 2), 'application/json', `${fileName(doc)}.json`);

/** The spreadsheet library is big, so it's only loaded when you actually download. */
export async function downloadXlsx(doc: MapDoc) {
  const { gridToWorkbook } = await import('../export/xlsx');
  const buf = await gridToWorkbook(treeToGrid(doc)).xlsx.writeBuffer();
  downloadBlob(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${fileName(doc)}.xlsx`);
}
