import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../model/store';
import { dropPosition, indexTree, type DropZone } from '../model/tree';
import { scopeTester } from '../model/scope';
import type { AttrDef, Node } from '../model/types';
import { AutoTextarea, caretOnFirstLine, caretOnLastLine, insertLineBreak } from './AutoTextarea';
import { AttrPopover } from './AttrPopover';
import { isAttrKey, useUi } from '../model/ui';

const isMod = (e: React.KeyboardEvent) => e.metaKey || e.ctrlKey;

export function Outline() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const focusArea = useEditor((s) => s.focusArea);
  const index = useMemo(() => indexTree(doc), [doc]);
  const attrNames = useMemo(() => new Map(doc.attributes.map((a) => [a.id, a])), [doc.attributes]);
  const applies = useMemo(() => scopeTester(doc), [doc]);
  const olRef = useRef<HTMLDivElement>(null);
  const nav = focusArea === 'outlineNav';
  const attrPop = useUi((s) => (s.attrPop?.from === 'outline' ? s.attrPop : null));
  useEffect(() => () => { if (useUi.getState().attrPop?.from === 'outline') useUi.getState().closeAttrPop(); }, []);
  /** Closing the attribute editor returns you to the row: typing again, or row navigation. */
  const closeAttrPop = useCallback(() => {
    const p = useUi.getState().attrPop;
    useUi.getState().closeAttrPop();
    if (!p) return;
    if (p.resume === 'edit') useEditor.getState().select(p.id, 'outline');
    else { useEditor.getState().select(p.id, 'outlineNav'); olRef.current?.focus({ preventScroll: true }); }
  }, []);
  // Drag and drop (rows are dragged by their bullet).
  const [dnd, setDndState] = useState<{ id: string; target: { id: string; zone: DropZone } | null } | null>(null);
  const dndRef = useRef(dnd);
  const setDnd = (v: typeof dnd) => { dndRef.current = v; setDndState(v); };
  const onDragStartRow = useCallback((id: string) => setDnd({ id, target: null }), []);
  const onDragOverRow = useCallback((id: string, zone: DropZone | null) => {
    const d = dndRef.current;
    if (!d) return;
    const target = zone ? { id, zone } : null;
    if (d.target?.id !== target?.id || d.target?.zone !== target?.zone) setDnd({ ...d, target });
  }, []);
  const onDropRow = useCallback(() => {
    const d = dndRef.current;
    setDnd(null);
    if (!d?.target) return;
    const s = useEditor.getState();
    const pos = dropPosition(s.doc, d.id, d.target.id, d.target.zone);
    if (pos) s.moveTo(d.id, pos.parent, pos.index);
  }, []);
  const onDragEndRow = useCallback(() => setDnd(null), []);

  // Navigation mode: keep the selected row in view as you move with the arrows.
  useEffect(() => {
    if (nav) olRef.current?.querySelector('.ol-row.sel')?.scrollIntoView({ block: 'nearest' });
  }, [nav, selectedId]);

  /** Keys while a row is selected but not being edited (after Esc). */
  const onNavKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !nav) return;
    const s = useEditor.getState();
    const { visible, parent } = indexTree(s.doc);
    const id = s.selectedId;
    const n = s.doc.nodes[id];
    let handled = true;
    if (!n) {
      if (/^(Arrow|Enter| |F2)/.test(e.key)) s.select(s.doc.rootId, 'outlineNav');
      else handled = false;
    }
    else if (isMod(e) && e.key.toLowerCase() === 'z') (e.shiftKey ? s.redo() : s.undo());
    else if (isMod(e) && e.key.toLowerCase() === 'y') s.redo();
    else if ((e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) || e.key === 'F2' || e.key === ' ') s.setFocusArea('outline'); // edit this row
    else if (e.key === 'Enter') { s.addSibling(id, true); s.setFocusArea('outline'); } // new item, typing
    else if (isAttrKey(e) || (e.key.toLowerCase() === 'i' && !isMod(e) && !e.altKey)) useUi.getState().openAttrPop(id, 'outline', 'select');
    else if (e.key === 'Escape') s.select('', 'outlineNav');
    else if (e.key === 'Tab') (e.shiftKey ? s.outdent(id) : s.indent(id));
    else if ((e.key === 'Backspace' || e.key === 'Delete') && parent.get(id)) s.remove(id);
    else if (e.altKey && e.key === 'ArrowUp') s.move(id, -1);
    else if (e.altKey && e.key === 'ArrowDown') s.move(id, 1);
    else if (isMod(e) && e.key === 'ArrowUp') s.toggle(id, true);
    else if (isMod(e) && e.key === 'ArrowDown') s.toggle(id, false);
    else if (e.key === 'ArrowUp') { const p = visible[visible.indexOf(id) - 1]; if (p) s.select(p, 'outlineNav'); }
    else if (e.key === 'ArrowDown') { const x = visible[visible.indexOf(id) + 1]; if (x) s.select(x, 'outlineNav'); }
    else if (e.key === 'ArrowLeft') { if (n.children.length && !n.collapsed) s.toggle(id, true); else if (parent.get(id)) s.select(parent.get(id)!, 'outlineNav'); }
    else if (e.key === 'ArrowRight') { if (n.collapsed) s.toggle(id, false); else if (n.children[0]) s.select(n.children[0], 'outlineNav'); }
    else handled = false;
    if (handled) e.preventDefault();
  };

  return (
    <div className={`ol${nav ? ' nav' : ''}`} role="tree" ref={olRef} tabIndex={-1} onKeyDown={onNavKey}>
      {index.visible.map((id) => (
        <Row
          key={id}
          node={doc.nodes[id]}
          depth={index.depth.get(id)!}
          selected={id === selectedId}
          focused={focusArea === 'outline' && id === selectedId}
          attrNames={attrNames}
          attrOpen={attrPop?.id === id}
          onCloseAttrs={closeAttrPop}
          dragId={dnd?.id ?? null}
          dropZone={dnd?.target?.id === id ? dnd.target.zone : null}
          onDragStartRow={onDragStartRow}
          onDragOverRow={onDragOverRow}
          onDropRow={onDropRow}
          onDragEndRow={onDragEndRow}
          shown={doc.attributes.filter((a) => applies(a, id) && String(doc.nodes[id].attrs[a.id] ?? '').trim() !== '').map((a) => a.id).join(',')}
        />
      ))}
    </div>
  );
}

interface RowProps {
  node: Node;
  depth: number;
  selected: boolean;
  focused: boolean;
  attrNames: Map<string, AttrDef>;
  /** Filled, in-scope attribute ids (joined). */
  shown: string;
  /** The inline attribute editor is open under this row. */
  attrOpen: boolean;
  onCloseAttrs: () => void;
  dragId: string | null;
  dropZone: DropZone | null;
  onDragStartRow: (id: string) => void;
  onDragOverRow: (id: string, zone: DropZone | null) => void;
  onDropRow: () => void;
  onDragEndRow: () => void;
}

const Row = memo(function Row({ node, depth, selected, focused, attrNames, shown, attrOpen, onCloseAttrs, dragId, dropZone, onDragStartRow, onDragOverRow, onDropRow, onDragEndRow }: RowProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep keyboard focus on the selected row, also after indent/outdent moved it in the DOM.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (focused && !attrOpen && el && document.activeElement !== el) {
      el.focus({ preventScroll: false });
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const s = useEditor.getState();
    const id = node.id;
    // Looked up at key time so rows don't re-render whenever any other row changes.
    const { visible, parent: parents } = indexTree(s.doc);
    const parent = parents.get(id) ?? null;
    const i = visible.indexOf(id);
    let handled = true;

    if (isMod(e) && e.key.toLowerCase() === 'z') (e.shiftKey ? s.redo() : s.undo());
    else if (isMod(e) && e.key.toLowerCase() === 'y') s.redo();
    else if (isAttrKey(e)) useUi.getState().openAttrPop(id, 'outline', 'edit'); // ⌘I / Ctrl+I: edit this row's attributes
    else if (e.key === 'Escape') { s.setFocusArea('outlineNav'); (e.currentTarget.closest('.ol') as HTMLElement | null)?.focus(); } // stop editing, keep the row selected
    else if (e.key === 'Enter' && e.ctrlKey) insertLineBreak(e.currentTarget); // Ctrl+Enter = line break, like Shift+Enter
    else if (e.key === 'Enter' && !e.shiftKey) s.addSibling(id, true); // Shift+Enter = line break (textarea default)
    else if (e.key === 'Tab') (e.shiftKey ? s.outdent(id) : s.indent(id));
    else if (e.key === 'Backspace' && isMod(e) && e.shiftKey && parent) s.remove(id);
    else if (e.key === 'Backspace' && node.text === '' && !node.children.length && parent) s.remove(id);
    else if (e.altKey && e.key === 'ArrowUp') s.move(id, -1);
    else if (e.altKey && e.key === 'ArrowDown') s.move(id, 1);
    else if (isMod(e) && e.key === 'ArrowUp') s.toggle(id, true);
    else if (isMod(e) && e.key === 'ArrowDown') s.toggle(id, false);
    else if (e.key === 'ArrowUp' && i > 0 && caretOnFirstLine(e.currentTarget)) s.select(visible[i - 1], 'outline');
    else if (e.key === 'ArrowDown' && i < visible.length - 1 && caretOnLastLine(e.currentTarget)) s.select(visible[i + 1], 'outline');
    else handled = false;
    if (handled) e.preventDefault();
  };

  const selectMe = () => {
    const s = useEditor.getState();
    if (s.selectedId !== node.id || s.focusArea !== 'outline') s.select(node.id, 'outline');
  };
  const chips = shown ? shown.split(',').map((k) => [k, node.attrs[k]] as const) : [];
  const hasKids = node.children.length > 0;

  return (
    <>
      <div
        className={`ol-row${selected ? ' sel' : ''}${focused ? ' editing' : ''}${depth === 0 ? ' root' : ''}${dragId === node.id ? ' dragging' : ''}${dropZone ? ` drop-${dropZone}` : ''}`}
        style={{ paddingLeft: 8 + Math.max(0, depth - 1) * 20 }}
        role="treeitem"
        aria-expanded={hasKids ? !node.collapsed : undefined}
        onDragOver={(e) => {
          if (!dragId) return;
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientY - r.top) / r.height;
          const zone: DropZone = depth === 0 ? 'inside' : f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'inside';
          const ok = !!dropPosition(useEditor.getState().doc, dragId, node.id, zone);
          if (ok) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
          onDragOverRow(node.id, ok ? zone : null);
        }}
        onDrop={(e) => { e.preventDefault(); onDropRow(); }}
      >
        {depth > 0 && (
          <button
            className={`ol-caret${hasKids ? '' : ' leaf'}`}
            tabIndex={-1}
            draggable
            title="Drag to move · click to collapse"
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', node.text); e.dataTransfer.effectAllowed = 'move'; onDragStartRow(node.id); }}
            onDragEnd={onDragEndRow}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => hasKids && useEditor.getState().toggle(node.id)}
            aria-label={hasKids ? (node.collapsed ? 'Expand' : 'Collapse') : undefined}
          >
            {hasKids ? (node.collapsed ? '▸' : '▾') : '•'}
          </button>
        )}
        <AutoTextarea
          ref={inputRef}
          className="ol-input"
          value={node.text}
          placeholder={depth === 0 ? 'What are you breaking down?' : ''}
          onChange={(e) => useEditor.getState().setText(node.id, e.target.value)}
          onFocus={selectMe}
          onMouseDown={selectMe}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {node.collapsed && hasKids && <span className="ol-hidden">{node.children.length}+</span>}
        {chips.length > 0 && (
          <span className="ol-chips">
            {chips.map(([k, v]) => <span key={k} className="chip">{attrNames.get(k)!.name}: {String(v)}</span>)}
          </span>
        )}
      </div>
      {attrOpen && <AttrPopover nodeId={node.id} className="in-outline" style={{ marginLeft: 26 + Math.max(0, depth - 1) * 20 }} onClose={onCloseAttrs} />}
    </>
  );
});
