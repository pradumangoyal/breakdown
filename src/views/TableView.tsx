import { memo, useEffect, useMemo, useRef } from 'react';
import { useEditor } from '../model/store';
import { indexTree } from '../model/tree';
import { describeScope, scopeTester } from '../model/scope';
import type { AttrDef, Node } from '../model/types';

const isMod = (e: React.KeyboardEvent) => e.metaKey || e.ctrlKey;

/**
 * Spreadsheet-style editing of attribute values: one row per visible node, one column per
 * attribute. Cells outside an attribute's scope are greyed and not editable.
 * Tab → next cell, Enter / ↓ → same column next row, ⇧Enter / ↑ → previous row.
 */
export function TableView({ onAddAttribute }: { onAddAttribute: () => void }) {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const index = useMemo(() => indexTree(doc), [doc]);
  const applies = useMemo(() => scopeTester(doc), [doc]);
  const wrap = useRef<HTMLDivElement>(null);

  // Follow selection made elsewhere (outline / map).
  useEffect(() => {
    if (useEditor.getState().focusArea === 'table') return;
    wrap.current?.querySelector(`tr[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (!doc.attributes.length) {
    return (
      <div className="tv tv-empty">
        <p>No attributes yet.</p>
        <p className="ap-hint">Attributes become columns here and in the Sheet. Each one can apply to all nodes, end nodes only, specific levels, or one branch.</p>
        <button onClick={onAddAttribute}>+ New attribute</button>
      </div>
    );
  }

  return (
    <div className="tv" ref={wrap}>
      <table>
        <thead>
          <tr>
            <th className="tv-node">Node</th>
            {doc.attributes.map((a) => (
              <th key={a.id} className={a.type === 'number' ? 'num' : ''}>
                {a.name}
                <span>{describeScope(doc, a)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {index.visible.map((id, row) => (
            <TableRow
              key={id}
              node={doc.nodes[id]}
              depth={index.depth.get(id)!}
              row={row}
              attrs={doc.attributes}
              scopeKey={doc.attributes.map((a) => (applies(a, id) ? '1' : '0')).join('')}
              selected={id === selectedId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  node: Node;
  depth: number;
  row: number;
  attrs: AttrDef[];
  /** "1" / "0" per attribute: in scope or not (a string keeps memo comparison cheap). */
  scopeKey: string;
  selected: boolean;
}

const TableRow = memo(function TableRow({ node, depth, row, attrs, scopeKey, selected }: RowProps) {
  const s = useEditor.getState;
  const select = () => { if (s().selectedId !== node.id || s().focusArea !== 'table') s().select(node.id, 'table'); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, col: number) => {
    const move = (dir: 1 | -1) => {
      const table = e.currentTarget.closest('table')!;
      const cells = [...table.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)];
      const next = dir === 1 ? cells.find((c) => Number(c.dataset.row) > row) : cells.reverse().find((c) => Number(c.dataset.row) < row);
      next?.focus();
      next?.select();
    };
    if (isMod(e) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? s().redo() : s().undo()); }
    else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') e.currentTarget.blur();
  };

  const hasKids = node.children.length > 0;
  return (
    <tr data-id={node.id} className={`${selected ? 'sel' : ''}${depth === 0 ? ' root' : ''}`}>
      <th className="tv-node" onMouseDown={select}>
        <span style={{ paddingLeft: Math.max(0, depth - 1) * 16 }}>
          {depth > 0 && (
            <button
              className={`ol-caret${hasKids ? '' : ' leaf'}`}
              tabIndex={-1}
              onClick={() => hasKids && s().toggle(node.id)}
              aria-label={hasKids ? (node.collapsed ? 'Expand' : 'Collapse') : undefined}
            >
              {hasKids ? (node.collapsed ? '▸' : '▾') : '•'}
            </button>
          )}
          <span className="tv-text">{node.text.split('\n')[0] || 'Untitled'}</span>
        </span>
      </th>
      {attrs.map((a, col) =>
        scopeKey[col] === '1' ? (
          <td key={a.id} className={a.type === 'number' ? 'num' : ''}>
            <input
              data-row={row}
              data-col={col}
              value={node.attrs[a.id] ?? ''}
              inputMode={a.type === 'number' ? 'decimal' : undefined}
              onChange={(e) => s().setAttr(node.id, a.id, e.target.value)}
              onFocus={select}
              onKeyDown={(e) => onKeyDown(e, col)}
              aria-label={`${a.name} for ${node.text || 'Untitled'}`}
            />
          </td>
        ) : (
          <td key={a.id} className="na" title={`${a.name} doesn't apply here`} />
        ),
      )}
    </tr>
  );
});
