import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useEditor } from '../model/store';
import { indexTree } from '../model/tree';
import type { AttrDef, Node } from '../model/types';
import { AutoTextarea, caretOnFirstLine, caretOnLastLine } from './AutoTextarea';

const isMod = (e: React.KeyboardEvent) => e.metaKey || e.ctrlKey;

export function Outline() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const focusArea = useEditor((s) => s.focusArea);
  const index = useMemo(() => indexTree(doc), [doc]);
  const attrNames = useMemo(() => new Map(doc.attributes.map((a) => [a.id, a])), [doc.attributes]);

  return (
    <div className="ol" role="tree">
      {index.visible.map((id) => (
        <Row
          key={id}
          node={doc.nodes[id]}
          depth={index.depth.get(id)!}
          selected={id === selectedId}
          focused={focusArea === 'outline' && id === selectedId}
          attrNames={attrNames}
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
}

const Row = memo(function Row({ node, depth, selected, focused, attrNames }: RowProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep keyboard focus on the selected row, also after indent/outdent moved it in the DOM.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (focused && el && document.activeElement !== el) {
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
    else if (e.key === 'Enter' && !e.shiftKey) s.addSibling(id, true); // Shift+Enter = line break
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
  const chips = Object.entries(node.attrs).filter(([k, v]) => attrNames.has(k) && String(v).trim() !== '');
  const hasKids = node.children.length > 0;

  return (
    <div className={`ol-row${selected ? ' sel' : ''}${depth === 0 ? ' root' : ''}`} style={{ paddingLeft: 8 + Math.max(0, depth - 1) * 20 }} role="treeitem" aria-expanded={hasKids ? !node.collapsed : undefined}>
      {depth > 0 && (
        <button
          className={`ol-caret${hasKids ? '' : ' leaf'}`}
          tabIndex={-1}
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
  );
});
