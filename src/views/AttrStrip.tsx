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
 * The attribute fields of the node being edited, as a vertical list right beside it.
 * Only attributes that apply to the node. Values save as you type.
 *   ↓ / Tab: next field · ↑ / ⇧Tab: previous field (↑ from the first: back to the text)
 *   ← (at the start of a text field, or on a dropdown): back to the text
 *   Enter: on a dropdown opens it; on a text field same as Enter on the node text · Esc: stop editing
 */
export function AttrStrip({ nodeId, className = '', style, onBack, onEnter, onEscape, onPastEnd }: {
  nodeId: string;
  className?: string;
  style?: React.CSSProperties;
  /** Leave the fields back to the node text. */
  onBack: () => void;
  onEnter: () => void;
  onEscape: () => void;
  /** ↓ from the last field (the outline uses it to move to the next row). */
  onPastEnd?: () => void;
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
    const to = (j: number) => {
      e.preventDefault();
      if (j < 0) onBack();
      else if (j < all.length) focusField(all[j], 'end');
      else if (e.key === 'ArrowDown') onPastEnd?.();
    };
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) to(i + 1);
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) to(i - 1);
    else if (e.key === 'ArrowLeft' && (!text || atStart(t))) { e.preventDefault(); onBack(); }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter(); } // dropdowns handle Enter themselves (open the list)
    else if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
  };

  return (
    <div
      className={`attr-strip ${className}`}
      style={style}
      data-node={nodeId}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        e.stopPropagation();
        // A click on the panel itself (padding, a label) must not move focus away and end the edit.
        if (!(e.target as Element).closest('input, select, textarea, button')) e.preventDefault();
      }}
    >
      {fields.map((a) => (
        <label key={a.id} className="attr-strip-field" title={describeScope(doc, a)}>
          <span className="attr-strip-name">{a.name}</span>
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
