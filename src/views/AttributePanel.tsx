import { useMemo, useState } from 'react';
import { useEditor } from '../model/store';
import { indexTree } from '../model/tree';
import { describeScope, levelName, scopeTester } from '../model/scope';
import { AttrForm } from './AttrForm';
import { AttrValueInput } from './AttrValueInput';

const filled = (v: unknown) => v !== undefined && String(v).trim() !== '';

export function AttributePanel() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const node = doc.nodes[selectedId];
  const index = useMemo(() => indexTree(doc), [doc]);
  const applies = useMemo(() => scopeTester(doc), [doc]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const s = useEditor.getState;
  const depth = node ? index.depth.get(node.id) ?? 0 : 0;
  const isRoot = depth === 0;
  const isEnd = !!node && !isRoot && node.children.length === 0;
  const maxDepth = Math.max(0, ...[...index.depth].filter(([id]) => doc.nodes[id].children.length === 0 && id !== doc.rootId).map(([, d]) => d));
  const here = node ? doc.attributes.filter((a) => applies(a, node.id)) : [];
  const hidden = node ? doc.attributes.filter((a) => !applies(a, node.id) && filled(node.attrs[a.id])) : [];

  const where = isRoot
    ? 'Central node: its values go on the line under the Sheet title.'
    : isEnd
      ? 'End node: its values go in the columns after the last level.'
      : `Has children: its values get a column beside “${levelName(doc, depth)}”, merged down with it.`;

  const remove = (id: string) => {
    const a = doc.attributes.find((x) => x.id === id)!;
    const count = Object.values(doc.nodes).filter((n) => filled(n.attrs[id])).length;
    if (count && !window.confirm(`Delete “${a.name}” and its ${count} value${count > 1 ? 's' : ''}? (You can undo.)`)) return;
    s().removeAttribute(id);
    setEditing(null);
  };

  return (
    <aside className="ap">
      {!node && (
        <section>
          <h3>This node</h3>
          <p className="ap-hint">Nothing selected. Click a node (or press an arrow key on the map) to see and edit its values.</p>
        </section>
      )}
      {node && <section>
        <h3>This node</h3>
        <p className="ap-node">{node.text.split('\n')[0] || 'Untitled'}</p>
        <p className="ap-hint">{where}</p>
        {here.map((a) => (
          <label key={a.id} className="ap-field">
            <span title={describeScope(doc, a)}>{a.name}{a.type === 'number' && <em> #</em>}</span>
            <AttrValueInput
              def={a}
              value={node.attrs[a.id]}
              onValue={(v) => s().setAttr(node.id, a.id, v)}
              onFocus={() => s().setFocusArea('map')}
            />
          </label>
        ))}
        {doc.attributes.length > 0 && here.length === 0 && <p className="ap-hint">No attributes apply to this node.</p>}
        {hidden.length > 0 && (
          <div className="ap-hidden">
            <p className="ap-hint">Kept but hidden: these no longer apply here, so they're left out of the Sheet.</p>
            {hidden.map((a) => (
              <div key={a.id} className="ap-hidden-row">
                <span className="chip">{a.name}: {String(node.attrs[a.id])}</span>
                <button onClick={() => s().setAttr(node.id, a.id, undefined)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>}

      <section>
        <h3>Attributes in this map</h3>
        {doc.attributes.length === 0 && editing !== 'new' && <p className="ap-hint">None yet. Each attribute can apply to all nodes, only end nodes, specific levels, or one branch.</p>}
        {doc.attributes.map((a, i) =>
          editing === a.id ? (
            <AttrForm
              key={a.id}
              doc={doc}
              attr={a}
              onSave={(name, type, scope, options) => { s().updateAttribute(a.id, { name, type, scope, options }); setEditing(null); }}
              onCancel={() => setEditing(null)}
              onDelete={() => remove(a.id)}
            />
          ) : (
            <div key={a.id} className="ap-attr">
              <div className="ap-attr-main">
                <strong>{a.name}</strong>{a.type === 'number' && <em> #</em>}{a.type === 'select' && <em> ▾ {(a.options ?? []).length} choices</em>}
                <span>{describeScope(doc, a)}</span>
              </div>
              <div className="ap-attr-tools">
                <button title="Move left in the Sheet" disabled={i === 0} onClick={() => s().moveAttribute(a.id, -1)}>↑</button>
                <button title="Move right in the Sheet" disabled={i === doc.attributes.length - 1} onClick={() => s().moveAttribute(a.id, 1)}>↓</button>
                <button onClick={() => setEditing(a.id)}>Edit</button>
              </div>
            </div>
          ),
        )}
        {editing === 'new' ? (
          <AttrForm
            doc={doc}
            onSave={(name, type, scope, options) => { s().addAttribute(name, type, scope, options); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button className="ap-new" onClick={() => setEditing('new')}>+ New attribute</button>
        )}
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
                onChange={(e) => s().setLevelName(lvl, e.target.value)}
                onFocus={() => s().setFocusArea('map')}
              />
            </label>
          ))}
          <label className="ap-check">
            <input type="checkbox" checked={doc.settings.numbering} onChange={(e) => s().setNumbering(e.target.checked)} />
            Number the nodes (1, 1.2, 1.2.1)
          </label>
        </section>
      )}
    </aside>
  );
}
