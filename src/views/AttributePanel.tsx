import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../model/store';
import { indexTree } from '../model/tree';
import { levelName } from '../export/grid';

export function AttributePanel() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const node = doc.nodes[selectedId];
  const index = useMemo(() => indexTree(doc), [doc]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'number'>('text');
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusAttr, setFocusAttr] = useState<string | null>(null);

  useEffect(() => {
    if (focusAttr) { inputs.current.get(focusAttr)?.focus(); setFocusAttr(null); }
  }, [focusAttr, doc.attributes]);

  if (!node) return <aside className="ap" />;
  const depth = index.depth.get(node.id) ?? 0;
  const isRoot = depth === 0;
  const isEnd = !isRoot && node.children.length === 0;
  const maxDepth = Math.max(0, ...[...index.depth].filter(([id]) => doc.nodes[id].children.length === 0 && id !== doc.rootId).map(([, d]) => d));

  const where = isRoot
    ? 'Central node: its attributes go on the line under the Sheet title.'
    : isEnd
      ? 'End node: its attributes go in the columns after the last level.'
      : `Has children: its attributes get a column beside “${levelName(doc, depth)}”, merged down with it.`;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = useEditor.getState().addAttribute(name, type);
    setName('');
    setFocusAttr(id);
  };

  return (
    <aside className="ap">
      <section>
        <h3>Attributes</h3>
        <p className="ap-node">{node.text || 'Untitled'}</p>
        <p className="ap-hint">{where}</p>
        {doc.attributes.length === 0 && <p className="ap-hint">No attributes yet. Add one below; it becomes available on every node.</p>}
        {doc.attributes.map((a) => (
          <label key={a.id} className="ap-field">
            <span>{a.name}{a.type === 'number' && <em> #</em>}</span>
            <input
              ref={(el) => { if (el) inputs.current.set(a.id, el); else inputs.current.delete(a.id); }}
              value={node.attrs[a.id] ?? ''}
              inputMode={a.type === 'number' ? 'decimal' : undefined}
              onChange={(e) => useEditor.getState().setAttr(node.id, a.id, e.target.value)}
              onFocus={() => useEditor.getState().setFocusArea('map')}
            />
          </label>
        ))}
        <form className="ap-add" onSubmit={add}>
          <input placeholder="New attribute (e.g. Owner)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value as 'text' | 'number')} aria-label="Type">
            <option value="text">Text</option>
            <option value="number">Number</option>
          </select>
          <button type="submit">Add</button>
        </form>
      </section>

      {maxDepth > 0 && (
        <section>
          <h3>Column names in the Sheet</h3>
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((lvl) => (
            <label key={lvl} className="ap-field">
              <span>Level {lvl}</span>
              <input
                placeholder={`Level ${lvl}`}
                value={doc.levelNames[lvl - 1] ?? ''}
                onChange={(e) => useEditor.getState().setLevelName(lvl, e.target.value)}
                onFocus={() => useEditor.getState().setFocusArea('map')}
              />
            </label>
          ))}
          <label className="ap-check">
            <input type="checkbox" checked={doc.settings.numbering} onChange={(e) => useEditor.getState().setNumbering(e.target.checked)} />
            Number the nodes (1, 1.2, 1.2.1)
          </label>
        </section>
      )}
    </aside>
  );
}
