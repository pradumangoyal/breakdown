import { useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor } from '../model/store';
import { describeScope, scopeTester } from '../model/scope';
import { AttrValueInput } from './AttrValueInput';
import { useUi } from '../model/ui';

/**
 * Keyboard editor for one node's attributes (opened with ⌘I / Ctrl+I, or I).
 * Shows only the attributes that apply to the node; values save as you type.
 * Tab / ↑↓ move between fields; Enter or Esc closes and returns to the node.
 */
export function AttrPopover({ nodeId, onClose, style, className = '' }: {
  nodeId: string;
  onClose: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const doc = useEditor((s) => s.doc);
  const node = doc.nodes[nodeId];
  const ref = useRef<HTMLDivElement>(null);
  const applies = scopeTester(doc);
  const fields = node ? doc.attributes.filter((a) => applies(a, nodeId)) : [];

  // Focus the first field (or the box itself when nothing applies, so Esc still works).
  useLayoutEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input, select');
    (first ?? ref.current)?.focus({ preventScroll: true });
    if (first instanceof HTMLInputElement) first.select();
  }, [nodeId]);

  // Clicking anywhere else closes it.
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', away, true);
    return () => document.removeEventListener('mousedown', away, true);
  }, [onClose]);

  if (!node) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // keep map / outline / app shortcuts out of it
    const target = e.target as HTMLElement;
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('input, select') ?? [])];
    const i = all.indexOf(target);
    if (!fields.length && e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onClose();
      if (!useUi.getState().attrsOpen) useUi.getState().toggleAttrs();
    } else if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      onClose();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && target instanceof HTMLInputElement) {
      e.preventDefault(); // in text fields ↑/↓ move between fields (dropdowns keep ↑/↓ for their choices)
      const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
      next?.focus();
      if (next instanceof HTMLInputElement) next.select();
    } else if (e.key === 'Tab' && all.length) {
      // Keep Tab inside the box (wraps around).
      e.preventDefault();
      const next = all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length];
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    }
  };

  return (
    <div ref={ref} className={`attr-pop ${className}`} style={style} tabIndex={-1} onKeyDown={onKeyDown} role="dialog" aria-label={`Attributes of ${node.text || 'Untitled'}`}>
      <div className="attr-pop-head">
        <strong>{node.text.split('\n')[0] || 'Untitled'}</strong>
        <span>Enter / Esc / ⇧⇧ done</span>
      </div>
      {fields.length ? (
        fields.map((a) => (
          <label key={a.id} className="attr-pop-field">
            <span title={describeScope(doc, a)}>{a.name}</span>
            <AttrValueInput def={a} value={node.attrs[a.id]} onValue={(v) => useEditor.getState().setAttr(nodeId, a.id, v)} />
          </label>
        ))
      ) : (
        <p className="attr-pop-none">
          {doc.attributes.length ? 'No attributes apply to this node.' : 'No attributes yet.'} Press <kbd>A</kbd> to open the Attributes panel and add one.
        </p>
      )}
    </div>
  );
}
