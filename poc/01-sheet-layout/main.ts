import { treeToGrid } from '../../src/export/grid';
import { gridToHtml } from '../../src/export/html';
import { gridToWorkbook } from '../../src/export/xlsx';
import { samples } from './samples';

const tabs = document.getElementById('tabs')!;
const bar = document.getElementById('bar')!;
const sheet = document.getElementById('sheet')!;

async function download(key: string) {
  const s = samples.find((x) => x.key === key)!;
  const buf = await gridToWorkbook(treeToGrid(s.make())).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${key}.xlsx` });
  a.click();
  URL.revokeObjectURL(url);
}

function show(key: string) {
  const s = samples.find((x) => x.key === key)!;
  const doc = s.make();
  const t0 = performance.now();
  const grid = treeToGrid(doc);
  const ms = (performance.now() - t0).toFixed(1);
  for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.key === key));
  bar.innerHTML = `
    <span>${Object.keys(doc.nodes).length} nodes → ${grid.rows.length - grid.dataStart} rows × ${grid.columns.length} columns, ${grid.merges.length} merges (${ms} ms)</span>
    ${grid.warnings.map((w) => `<span class="warn">⚠ ${w}</span>`).join('')}
    <button id="dl">Download .xlsx</button>`;
  document.getElementById('dl')!.onclick = () => download(key);
  sheet.innerHTML = gridToHtml(grid);
  history.replaceState(null, '', `#${key}`);
}

for (const s of samples) {
  const b = Object.assign(document.createElement('button'), { textContent: s.label });
  b.dataset.key = s.key;
  b.onclick = () => show(s.key);
  tabs.append(b);
}
const fromHash = () => show(samples.find((s) => `#${s.key}` === location.hash)?.key ?? samples[0].key);
window.addEventListener('hashchange', fromHash);
fromHash();
