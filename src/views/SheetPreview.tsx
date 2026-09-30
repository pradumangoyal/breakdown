import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../model/store';
import { treeToGrid } from '../export/grid';
import { gridToHtml } from '../export/html';

/** Live view of exactly what the export will put in the Sheet. */
export function SheetPreview({ onDownload }: { onDownload: () => void }) {
  // Rebuilt shortly after typing pauses: a big table (12k cells at 1,000 nodes) shouldn't slow each keystroke.
  const live = useEditor((s) => s.doc);
  const [doc, setDoc] = useState(live);
  useEffect(() => {
    const t = setTimeout(() => setDoc(live), 250);
    return () => clearTimeout(t);
  }, [live]);
  const grid = useMemo(() => treeToGrid(doc), [doc]);
  const html = useMemo(() => gridToHtml(grid), [grid]);
  return (
    <div className="sp">
      <div className="sp-bar">
        <strong>Sheet preview</strong>
        <span>{grid.rows.length - grid.dataStart} rows × {grid.columns.length} columns · {grid.merges.length} merged cells</span>
        {grid.warnings.map((w) => <span key={w} className="warn">⚠ {w}</span>)}
        <button onClick={onDownload}>Download .xlsx</button>
      </div>
      <div className="sp-sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
