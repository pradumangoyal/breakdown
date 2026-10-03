import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../model/store';
import { treeToGrid } from '../export/grid';
import { gridToHtml } from '../export/html';
import { levelName } from '../model/scope';
import type { AttrDef } from '../model/types';
import { AutoTextarea, insertLineBreak } from './AutoTextarea';
import { AttrValueInput } from './AttrValueInput';

/** What an editable cell edits: a node's text, one of its attribute values, or a level's column name. */
interface Target { node?: string; attr?: string; level?: number }
interface OpenCell extends Target { top: number; left: number; width: number; height: number }
type Then = 'next' | 'prev' | undefined;

const targetOf = (el: HTMLElement): Target => ({
  node: el.dataset.node,
  attr: el.dataset.attr,
  level: el.dataset.level ? Number(el.dataset.level) : undefined,
});
const sameTarget = (a: Target, b: Target) => a.node === b.node && a.attr === b.attr && a.level === b.level;

/**
 * The Sheet view: exactly what the export will contain, and editable in place.
 * Click a cell to edit what it shows (it writes back to the tree); grey cells don't apply.
 */
export function SheetPreview({ onDownload }: { onDownload: () => void }) {
  const live = useEditor((s) => s.doc);
  const [doc, setDoc] = useState(live);
  const [open, setOpen] = useState<OpenCell | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** Cell to open once the current edit has been saved: next/previous after Tab, or one you clicked. */
  const reopen = useRef<{ from: Target; then: Exclude<Then, undefined> } | { target: Target } | null>(null);

  // Rebuilt shortly after typing pauses (a big table shouldn't slow each keystroke);
  // held still while a cell is being edited so the editor stays on its cell.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setDoc(live), 250);
    return () => clearTimeout(t);
  }, [live, open]);
  const grid = useMemo(() => treeToGrid(doc), [doc]);
  const html = useMemo(() => gridToHtml(grid), [grid]);

  const startEdit = (cell: HTMLElement) => {
    const sheet = sheetRef.current!;
    const r = cell.getBoundingClientRect();
    const c = sheet.getBoundingClientRect();
    const t = targetOf(cell);
    setOpen({ ...t, top: r.top - c.top + sheet.scrollTop, left: r.left - c.left + sheet.scrollLeft, width: r.width, height: r.height });
    if (t.node) useEditor.getState().select(t.node, 'map'); // the attribute panel follows
  };

  // After Tab / Shift+Tab: once the refreshed table is on screen, open the next editable cell.
  useLayoutEffect(() => {
    const go = reopen.current;
    if (!go || open) return;
    reopen.current = null;
    const cells = [...(sheetRef.current?.querySelectorAll<HTMLElement>('[data-edit]') ?? [])];
    const next = 'target' in go
      ? cells.find((el) => sameTarget(targetOf(el), go.target))
      : cells[cells.findIndex((el) => sameTarget(targetOf(el), go.from)) + (go.then === 'next' ? 1 : -1)];
    if (next) {
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      startEdit(next);
    }
  });

  /** value === null → cancel. */
  const done = (value: string | null, then?: Then) => {
    const o = open;
    if (!o) return;
    const s = useEditor.getState();
    if (value !== null) {
      if (o.level !== undefined) s.setLevelName(o.level, value.trim());
      else if (o.node && o.attr) { if (value !== String(s.doc.nodes[o.node]?.attrs[o.attr] ?? '')) s.setAttr(o.node, o.attr, value); }
      else if (o.node && value !== s.doc.nodes[o.node]?.text) s.setText(o.node, value);
    }
    if (then) reopen.current = { from: o, then };
    setOpen(null);
    setDoc(useEditor.getState().doc); // show the change right away
  };

  const def = open?.attr ? live.attributes.find((a) => a.id === open.attr) : undefined;

  return (
    <div className="sp">
      <div className="sp-bar">
        <strong>Sheet</strong>
        <span>{grid.rows.length - grid.dataStart} rows × {grid.columns.length} columns · {grid.merges.length} merged cells · click a cell to edit</span>
        {grid.warnings.map((w) => <span key={w} className="warn">⚠ {w}</span>)}
        <button onClick={onDownload}>Download .xlsx</button>
      </div>
      <div
        className="sp-sheet"
        ref={sheetRef}
        onMouseDown={(e) => {
          const cell = (e.target as Element).closest<HTMLElement>('[data-edit]');
          if (!cell || (e.target as Element).closest('.sp-editor')) return;
          // An editor is open: clicking away saves it (blur); then the clicked cell opens.
          if (open) { reopen.current = { target: targetOf(cell) }; return; }
          e.preventDefault();
          startEdit(cell);
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {open && <CellEditor key={`${open.node}|${open.attr}|${open.level}`} cell={open} def={def} placeholder={open.level !== undefined ? levelName({ ...live, levelNames: [] }, open.level) : ''} done={done} />}
      </div>
    </div>
  );
}

function CellEditor({ cell, def, placeholder, done }: { cell: OpenCell; def?: AttrDef; placeholder: string; done: (v: string | null, then?: Then) => void }) {
  const doc = useEditor((s) => s.doc);
  const initial =
    cell.level !== undefined ? doc.levelNames[cell.level - 1] ?? ''
    : cell.node && cell.attr ? String(doc.nodes[cell.node]?.attrs[cell.attr] ?? '')
    : doc.nodes[cell.node ?? '']?.text ?? '';
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(null);
  const end = (v: string | null, then?: Then) => {
    if (finished.current) return;
    finished.current = true;
    done(v, then);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    e.stopPropagation(); // keep map / outline shortcuts out of it
    const textBox = e.currentTarget instanceof HTMLTextAreaElement;
    if (e.key === 'Escape') { e.preventDefault(); end(null); }
    else if (e.key === 'Tab') { e.preventDefault(); end(value, e.shiftKey ? 'prev' : 'next'); }
    else if (e.key === 'Enter' && e.ctrlKey && textBox) { e.preventDefault(); insertLineBreak(e.currentTarget as HTMLTextAreaElement); }
    else if (e.key === 'Enter' && !(e.shiftKey && textBox)) { e.preventDefault(); end(value); }
  };

  const style = { top: cell.top, left: cell.left, minWidth: Math.max(cell.width, 170), minHeight: cell.height };
  return (
    <div className="sp-editor" style={style}>
      {def ? (
        <AttrValueInput
          ref={ref as React.Ref<HTMLInputElement | HTMLSelectElement>}
          def={def}
          value={value}
          onValue={(v) => { setValue(v); if (def.type === 'select') end(v); }}
          onKeyDown={onKeyDown}
          onBlur={() => end(value)}
          aria-label={def.name}
        />
      ) : (
        <AutoTextarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => end(value)}
          aria-label={cell.level !== undefined ? 'Column name' : 'Node text'}
        />
      )}
    </div>
  );
}
