import { useMemo, useState } from 'react';
import { indexTree } from '../model/tree';
import { levelLabel } from '../model/scope';
import type { AttrDef, AttrScope, MapDoc } from '../model/types';

interface Props {
  doc: MapDoc;
  /** Editing an existing attribute; omit to create a new one. */
  attr?: AttrDef;
  onSave: (name: string, type: AttrDef['type'], scope: AttrScope) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/** Name, type and scope ("which nodes" + "where") of one attribute. */
export function AttrForm({ doc, attr, onSave, onCancel, onDelete }: Props) {
  const [name, setName] = useState(attr?.name ?? '');
  const [type, setType] = useState<AttrDef['type']>(attr?.type ?? 'text');
  const [nodes, setNodes] = useState<AttrScope['nodes']>(attr?.scope?.nodes ?? 'all');
  const [levels, setLevels] = useState<number[]>(attr?.scope?.levels ?? []);
  const [within, setWithin] = useState(attr?.scope?.within ?? '');
  const [error, setError] = useState('');

  const index = useMemo(() => indexTree(doc), [doc]);
  const maxDepth = Math.max(0, ...index.depth.values(), ...levels);
  // Branches you can limit an attribute to: every node with children (the centre = whole map).
  const branches = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    const walk = (id: string, d: number) => {
      const n = doc.nodes[id];
      if (d > 0 && n.children.length) {
        const text = n.text.trim() || 'Untitled';
        out.push({ id, label: `${' '.repeat(d - 1)}${text.length > 36 ? `${text.slice(0, 35)}…` : text}` });
      }
      n.children.forEach((c) => walk(c, d + 1));
    };
    walk(doc.rootId, 0);
    return out;
  }, [doc]);
  const withinMissing = !!within && !doc.nodes[within];

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError('Give the attribute a name.');
    if (doc.attributes.some((a) => a.id !== attr?.id && a.name.toLowerCase() === clean.toLowerCase())) return setError(`“${clean}” already exists.`);
    if (nodes === 'levels' && !levels.length) return setError('Pick at least one level.');
    onSave(clean, type, { nodes, ...(nodes === 'levels' ? { levels: [...levels].sort((a, b) => a - b) } : {}), within: within || null });
  };

  const toggleLevel = (l: number) => setLevels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));

  return (
    <form className="af" onSubmit={save}>
      <div className="af-row">
        <input autoFocus placeholder="Attribute name (e.g. Owner)" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
        <select value={type} onChange={(e) => setType(e.target.value as AttrDef['type'])} aria-label="Type">
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
      </div>

      <fieldset>
        <legend>Applies to</legend>
        <label><input type="radio" checked={nodes === 'all'} onChange={() => setNodes('all')} /> All nodes</label>
        <label><input type="radio" checked={nodes === 'end'} onChange={() => setNodes('end')} /> End nodes only</label>
        <label><input type="radio" checked={nodes === 'levels'} onChange={() => setNodes('levels')} /> Specific levels</label>
        {nodes === 'levels' && (
          <div className="af-levels">
            {Array.from({ length: maxDepth + 1 }, (_, l) => (
              <label key={l} className={levels.includes(l) ? 'on' : ''}>
                <input type="checkbox" checked={levels.includes(l)} onChange={() => toggleLevel(l)} /> {levelLabel(doc, l)}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Where</legend>
        <select value={withinMissing ? '' : within} onChange={(e) => setWithin(e.target.value)} aria-label="Where">
          <option value="">Whole map</option>
          {branches.map((b) => <option key={b.id} value={b.id}>Only inside: {b.label}</option>)}
        </select>
        {withinMissing && <p className="af-warn">Its branch was deleted, so it currently applies nowhere.</p>}
      </fieldset>

      {error && <p className="af-warn">{error}</p>}
      <div className="af-actions">
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
        <span className="spacer" />
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary">{attr ? 'Save' : 'Add'}</button>
      </div>
    </form>
  );
}
