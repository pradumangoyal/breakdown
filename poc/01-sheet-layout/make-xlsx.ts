import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeToGrid } from '../../src/export/grid';
import { gridToWorkbook } from '../../src/export/xlsx';
import { samples } from '../../src/samples';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });

for (const s of samples) {
  const grid = treeToGrid(s.make());
  const file = join(out, `${s.key}.xlsx`);
  await gridToWorkbook(grid).xlsx.writeFile(file);
  console.log(`${file}  (${grid.rows.length} rows × ${grid.columns.length} cols, ${grid.merges.length} merges)`);
}
