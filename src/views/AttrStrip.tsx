import { useEditor } from '../model/store';
import { describeScope, scopeTester } from '../model/scope';
import { AttrValueInput } from './AttrValueInput';
import { KeySelect } from './KeySelect';

/** The fields of a strip, in order (so editors can move into / out of it with the arrow keys). */
export const stripFields = (strip: Element | null | undefined) => [...(strip?.querySelectorAll<HTMLElement>('[data-field]') ?? [])];

/** Focus a field; text fields get the cursor at the end (or start), like moving through a spreadsheet row. */
export function focusField(el: HTMLElement | undefined, at: 'start' | 'end' = 'end') {
  if (!el) return false;
  el.focus({ preventScroll: true });
  if (el instanceof HTMLInputElement) { const p = at === 'end' ? el.value.length : 0; el.setSelectionRange(p, p); }
  return true;
}

const atEnd = (el: HTMLInputElement | HTMLTextAreaElement) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
const atStart = (el: HTMLInputElement | HTMLTextAreaElement) => el.selectionStart === 0 && el.selectionEnd === 0;
/** → at the very end of a text box (no selection): time to move to the next field. */
export const caretAtEnd = atEnd;

/**
 * The attribute fields of the node being edited, shown right beside it like the rest of a
 * spreadsheet row. Only attributes that apply to the node. Values save as you type.
 *   → at the end of a field / ← at its start: next / previous field (← from the first: back to the text)
 *   Tab / ⇧Tab: next / previous field · Enter: same as Enter on the node text · Esc: stop editing
 */
export function AttrStrip({ nodeId, className = '', onBack, onEnter, onEscape, onVertical }: {
  nodeId: string;
  className?: string;
  /** Leave the strip back to the node text. */
  onBack: () => void;
  onEnter: () => void;
  onEscape: () => void;
  /** ↑ / ↓ in a text field (the outline uses it to move between rows). */
  onVertical?: (dir: 1 | -1) => void;
}) {
  const doc = useEditor((s) => s.doc);
  const node = doc.nodes[nodeId];
  if (!node) return null;
  const applies = scopeTester(doc);
  const fields = doc.attributes.filter((a) => applies(a, nodeId));
  if (!fields.length) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const all = stripFields(e.currentTarget);
    const i = all.indexOf(t);
    if (i < 0) return;
    e.stopPropagation(); // map / outline / app shortcuts stay out of the fields
    const text = t instanceof HTMLInputElement;
    const go = (dir: 1 | -1) => {
      e.preventDefault();
      if (dir === -1 && i === 0) onBack();
      else focusField(all[i + dir], dir === 1 ? 'start' : 'end');
    };
    if (e.key === 'ArrowRight' && (!text || atEnd(t)) && i < all.length - 1) go(1);
    else if (e.key === 'ArrowLeft' && (!text || atStart(t))) go(-1);
    else if (e.key === 'Tab') { if (e.shiftKey) go(-1); else if (i < all.length - 1) go(1); else e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    else if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
    else if (text && onVertical && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); onVertical(e.key === 'ArrowDown' ? 1 : -1); }
  };

  return (
    <div className={`attr-strip ${className}`} onKeyDown={onKeyDown} onMouseDown={(e) => e.stopPropagation()}>
      {fields.map((a) => (
        <label key={a.id} className="attr-strip-field" title={describeScope(doc, a)}>
          <span>{a.name}</span>
          {a.type === 'select' ? (
            <KeySelect label={a.name} value={String(node.attrs[a.id] ?? '')} options={a.options ?? []} onChange={(v) => useEditor.getState().setAttr(nodeId, a.id, v)} />
          ) : (
            <AttrValueInput def={a} data-field value={node.attrs[a.id]} onValue={(v) => useEditor.getState().setAttr(nodeId, a.id, v)} aria-label={a.name} />
          )}
        </label>
      ))}
    </div>
  );
}
