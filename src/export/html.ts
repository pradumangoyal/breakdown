import type { Grid } from './grid';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Grid → <table> with rowspan/colspan. Mirrors exactly what the Sheet will contain. */
export function gridToHtml(grid: Grid): string {
  const anchors = new Map<string, { rs: number; cs: number }>();
  for (const m of grid.merges) anchors.set(`${m.r0}:${m.c0}`, { rs: m.r1 - m.r0 + 1, cs: m.c1 - m.c0 + 1 });

  const cols = grid.columns.map((c) => `<col class="col-${c.kind}" style="width:${c.width}px">`).join('');
  const body = grid.rows
    .map((row, r) => {
      const tds = row
        .map((cell, c) => {
          if (cell.kind === 'covered') return '';
          const span = anchors.get(`${r}:${c}`);
          // Editable cells carry what they edit: node text, an attribute value, or a level's column name.
          const col = grid.columns[c];
          const edit =
            (cell.kind === 'node' || cell.kind === 'title') && cell.nodeId ? `data-edit data-node="${cell.nodeId}"`
            : cell.attrId && cell.nodeId ? `data-edit data-node="${cell.nodeId}" data-attr="${cell.attrId}"`
            : cell.kind === 'header' && col?.kind === 'level' ? `data-edit data-level="${col.level}"`
            : '';
          const attrs = [
            `class="k-${cell.kind}${cell.depth ? ` d-${Math.min(cell.depth, 6)}` : ''}"`,
            edit,
            span && span.rs > 1 ? `rowspan="${span.rs}"` : '',
            span && span.cs > 1 ? `colspan="${span.cs}"` : '',
          ].filter(Boolean).join(' ');
          const tag = cell.kind === 'header' ? 'th' : 'td';
          const text = cell.value === null ? '' : esc(String(cell.value)).replace(/\n/g, '<br>');
          return `<${tag} ${attrs}>${text}</${tag}>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');
  const total = grid.columns.reduce((sum, c) => sum + c.width, 0);
  return `<table class="grid" style="width:${total}px"><colgroup>${cols}</colgroup>${body}</table>`;
}
