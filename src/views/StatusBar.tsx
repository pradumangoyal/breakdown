import { useEffect, useState } from 'react';
import { useEditor } from '../model/store';

type Mode = 'map-edit' | 'outline-edit' | 'table-edit' | 'sheet-edit' | 'attrs-edit' | 'selected-map' | 'selected-outline' | 'selected' | 'none';

/** What has keyboard focus right now (read from the DOM, so it is always truthful). */
function useFocusKind() {
  const [kind, setKind] = useState('');
  useEffect(() => {
    const read = () => {
      const el = document.activeElement;
      setKind(
        el?.closest('.attr-pop') ? 'attrs-edit'
        : el?.closest('.sp-editor') ? 'sheet-edit'
        : el?.classList.contains('mm-input') ? 'map-edit'
        : el?.classList.contains('ol-input') ? 'outline-edit'
        : el?.closest('.tv td') ? 'table-edit'
        : el?.classList.contains('mm-viewport') ? 'map'
        : el?.classList.contains('ol') ? 'outline'
        : '',
      );
    };
    const later = () => setTimeout(read, 0);
    read();
    document.addEventListener('focusin', read);
    document.addEventListener('focusout', later);
    return () => { document.removeEventListener('focusin', read); document.removeEventListener('focusout', later); };
  }, []);
  return kind;
}

const HINTS: Record<Mode, string[]> = {
  'map-edit': ['Enter finish', '⇧Enter / ⌃Enter new line', 'Tab add child', '⇧⇧ attributes', 'Esc stop editing'],
  'outline-edit': ['Enter new item', '⇧Enter / ⌃Enter new line', 'Tab indent', '⇧⇧ attributes', 'Esc stop editing'],
  'table-edit': ['Tab next cell', 'Enter next row', 'Esc leave cell'],
  'attrs-edit': ['Tab / ↑↓ next field', 'Enter / Esc / ⇧⇧ done'],
  'sheet-edit': ['Enter save', 'Tab / ⇧Tab next / previous cell', '⇧Enter / ⌃Enter new line', 'Esc cancel'],
  'selected-map': ['⇧Enter / F2 edit', 'Enter add sibling', 'Tab add child', '⇧⇧ attributes', '↑↓←→ move', 'Esc deselect'],
  'selected-outline': ['⇧Enter / F2 edit', 'Enter add item', '↑↓ move', 'Tab indent', '⇧⇧ attributes', 'Esc deselect'],
  selected: ['Click into the map or outline to use the keyboard'],
  none: ['Click a node, or press ↓ on the map'],
};

export function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const focus = useFocusKind();
  const node = doc.nodes[selectedId];

  const mode: Mode =
    focus === 'map-edit' || focus === 'outline-edit' || focus === 'table-edit' || focus === 'sheet-edit' || focus === 'attrs-edit' ? focus
    : !node ? 'none'
    : focus === 'map' ? 'selected-map'
    : focus === 'outline' ? 'selected-outline'
    : 'selected';
  const editing = mode.endsWith('-edit');
  const name = (node?.text.split('\n')[0] || 'Untitled').slice(0, 48);
  const label =
    mode === 'none' ? 'Nothing selected'
    : mode === 'table-edit' ? `✎ Editing values · ${name}`
    : mode === 'sheet-edit' ? '✎ Editing the Sheet'
    : mode === 'attrs-edit' ? `✎ Editing attributes · ${name}`
    : editing ? `✎ Editing · ${name}`
    : `Selected · ${name}`;

  return (
    <footer className={`statusbar${editing ? ' is-editing' : ''}`} aria-live="polite">
      <span className="statusbar-mode">{label}</span>
      <span className="statusbar-keys">{HINTS[mode].map((h) => <kbd key={h}>{h}</kbd>)}</span>
    </footer>
  );
}
