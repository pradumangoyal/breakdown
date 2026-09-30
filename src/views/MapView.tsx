import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom';
import { useEditor } from '../model/store';
import { countDescendants } from '../model/tree';
import type { AttrDef, Node } from '../model/types';
import { layoutMap, type Box, type Size } from './layout';

const BRANCH_COLORS = ['#2f6fdf', '#d9480f', '#2b8a3e', '#9c36b5', '#c2255c', '#0c8599', '#e67700', '#5f3dc4'];
const colorOf = (b: number) => (b < 0 ? '#495057' : BRANCH_COLORS[b % BRANCH_COLORS.length]);
const MAX_CHIPS = 3;

/** Size guess before a node has been measured (first frame only). */
const estimate = (n: Node, depth: number): Size => ({
  w: Math.min(260, 22 + n.text.length * (depth === 0 ? 10 : 7.4)),
  h: (depth === 0 ? 44 : 30) + (Object.keys(n.attrs).length ? 20 : 0),
});

const isMod = (e: React.KeyboardEvent | KeyboardEvent) => e.metaKey || e.ctrlKey;

export function MapView() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const editingId = useEditor((s) => s.editingId);
  const [sizes, setSizes] = useState(() => new Map<string, Size>());
  /** First keystroke when typing over a selected node, tied to that node. */
  const [seed, setSeed] = useState<{ id: string; text: string } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown>>();
  const nodeEls = useRef(new Map<string, HTMLDivElement>());
  const needsFit = useRef(true);
  const boxCache = useRef(new Map<string, Box>());

  const layout = useMemo(() => {
    const l = layoutMap(doc, (id, d) => sizes.get(id) ?? estimate(doc.nodes[id], d));
    // Reuse unchanged box objects so memoised nodes that didn't move skip re-rendering.
    const stable = new Map<string, Box>();
    for (const [id, b] of l.boxes) {
      const old = boxCache.current.get(id);
      stable.set(id, old && old.x === b.x && old.y === b.y && old.w === b.w && old.h === b.h ? old : b);
    }
    boxCache.current = stable;
    l.boxes = stable;
    return l;
  }, [doc, sizes]);

  // Measure rendered nodes; re-layout only if something actually changed size.
  useLayoutEffect(() => {
    let next: Map<string, Size> | null = null;
    for (const [id, el] of nodeEls.current) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const old = sizes.get(id);
      if (!old || old.w !== w || old.h !== h) (next ??= new Map(sizes)).set(id, { w, h });
    }
    if (next) setSizes(next);
  });

  const register = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);

  // Pan (drag / two-finger scroll) and zoom (pinch / ctrl+wheel / buttons).
  useEffect(() => {
    const vp = viewportRef.current!;
    const sel = select(vp);
    const z = zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .filter((e: Event) => {
        if (e.type === 'wheel') return (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey;
        return !(e as MouseEvent).button && !(e.target as Element).closest('.mm-node, .mm-toggle, .mm-tools');
      })
      .on('zoom', (e) => {
        const t = e.transform;
        canvasRef.current!.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
      });
    sel.call(z).on('dblclick.zoom', null);
    zoomRef.current = z;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const k = zoomTransform(vp).k;
      z.translateBy(sel, -e.deltaX / k, -e.deltaY / k);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => { vp.removeEventListener('wheel', onWheel); sel.on('.zoom', null); };
  }, []);

  /**
   * `overview`: shrink as far as needed to show everything (the Fit button).
   * Otherwise (on load) never go below a readable zoom; if the map is bigger than
   * the screen, centre on the central node and let the user pan from there.
   */
  const fit = useCallback((overview = true) => {
    const vp = viewportRef.current!;
    const whole = Math.min(1, (vp.clientWidth - 20) / layout.width, (vp.clientHeight - 20) / layout.height);
    const k = Math.max(overview ? 0.15 : 0.7, whole);
    let x = (vp.clientWidth - layout.width * k) / 2;
    let y = (vp.clientHeight - layout.height * k) / 2;
    if (k > whole) {
      const root = layout.boxes.get(doc.rootId)!;
      x = 20 - (root.x - 20) * k;
      y = vp.clientHeight / 2 - (root.y + root.h / 2) * k;
    }
    select(vp).call(zoomRef.current!.transform, zoomIdentity.translate(x, y).scale(k));
  }, [layout, doc.rootId]);

  // Fit once when a different map is loaded (after the first real measurement).
  useEffect(() => { needsFit.current = true; }, [doc.id]);
  useEffect(() => {
    if (needsFit.current && sizes.size) { needsFit.current = false; fit(false); }
  }, [sizes, fit]);

  // Keep the selected node on screen (e.g. while typing in the outline).
  useEffect(() => {
    const box = layout.boxes.get(selectedId);
    const vp = viewportRef.current;
    if (!box || !vp || needsFit.current) return;
    const t = zoomTransform(vp);
    const left = t.x + box.x * t.k;
    const top = t.y + box.y * t.k;
    const right = left + box.w * t.k;
    const bottom = top + box.h * t.k;
    const m = 40;
    let dx = 0;
    let dy = 0;
    if (left < m) dx = m - left;
    else if (right > vp.clientWidth - m) dx = vp.clientWidth - m - right;
    if (top < m) dy = m - top;
    else if (bottom > vp.clientHeight - m) dy = vp.clientHeight - m - bottom;
    if (dx || dy) zoomRef.current!.translateBy(select(vp), dx / t.k, dy / t.k);
  }, [selectedId, layout]);

  const endEdit = useCallback(() => {
    setSeed(null);
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editingId) return;
    const s = useEditor.getState();
    const id = s.selectedId;
    const n = s.doc.nodes[id];
    if (!n) return;
    const parent = findParent(s.doc.nodes, id);
    const siblings = parent ? s.doc.nodes[parent].children : [id];
    const i = siblings.indexOf(id);
    const go = (target?: string) => { if (target) s.select(target, 'map'); };
    let handled = true;

    if (isMod(e) && e.key.toLowerCase() === 'z') (e.shiftKey ? s.redo() : s.undo());
    else if (isMod(e) && e.key.toLowerCase() === 'y') s.redo();
    else if (e.key === 'Tab' && !e.shiftKey) { setSeed(null); s.setEditing(s.addChild(id)); }
    else if (e.key === 'Enter') { setSeed(null); s.setEditing(s.addSibling(id)); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && parent) s.remove(id);
    else if (e.altKey && e.key === 'ArrowUp') s.move(id, -1);
    else if (e.altKey && e.key === 'ArrowDown') s.move(id, 1);
    else if (isMod(e) && e.key === 'ArrowUp') s.toggle(id, true);
    else if (isMod(e) && e.key === 'ArrowDown') s.toggle(id, false);
    else if (e.key === 'ArrowLeft') go(parent ?? undefined);
    else if (e.key === 'ArrowRight') { if (n.collapsed) s.toggle(id, false); go(n.children[0]); }
    else if (e.key === 'ArrowUp') go(siblings[i - 1]);
    else if (e.key === 'ArrowDown') go(siblings[i + 1]);
    else if (e.key === 'F2' || e.key === ' ') { setSeed(null); s.setEditing(id); }
    else if (e.key.length === 1 && !isMod(e) && !e.altKey) { setSeed({ id, text: e.key }); s.setEditing(id); } // type to replace
    else handled = false;
    if (handled) e.preventDefault();
  };

  const attrNames = useMemo(() => new Map(doc.attributes.map((a) => [a.id, a])), [doc.attributes]);

  return (
    <div
      className="mm-viewport"
      ref={viewportRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => useEditor.getState().setFocusArea('map')}
    >
      <div className="mm-canvas" ref={canvasRef} style={{ width: layout.width, height: layout.height }}>
        <svg className="mm-edges" width={layout.width} height={layout.height}>
          {layout.edges.map(({ from, to }) => {
            const a = layout.boxes.get(from)!;
            const b = layout.boxes.get(to)!;
            return (
              <Edge
                key={to}
                x1={a.x + a.w}
                y1={a.y + a.h / 2}
                x2={b.x}
                y2={b.y + b.h / 2}
                color={colorOf(layout.branch.get(to)!)}
                width={layout.depth.get(to) === 1 ? 2.2 : 1.5}
              />
            );
          })}
        </svg>
        {[...layout.boxes].map(([id, box]) => (
          <MapNode
            key={id}
            node={doc.nodes[id]}
            box={box}
            depth={layout.depth.get(id)!}
            color={colorOf(layout.branch.get(id)!)}
            hidden={doc.nodes[id].collapsed ? countDescendants(doc, id) : 0}
            selected={id === selectedId}
            editing={id === editingId}
            seed={id === editingId && seed?.id === id ? seed.text : null}
            attrNames={attrNames}
            register={register}
            onDone={endEdit}
          />
        ))}
      </div>
      <div className="mm-tools">
        <button title="Zoom in" onClick={() => zoomRef.current!.scaleBy(select(viewportRef.current!), 1.25)}>+</button>
        <button title="Zoom out" onClick={() => zoomRef.current!.scaleBy(select(viewportRef.current!), 0.8)}>−</button>
        <button title="Show the whole map" onClick={() => fit(true)}>Fit</button>
      </div>
    </div>
  );
}

const Edge = memo(function Edge({ x1, y1, x2, y2, color, width }: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }) {
  const dx = (x2 - x1) / 2;
  return <path d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} stroke={color} strokeWidth={width} fill="none" />;
});

function findParent(nodes: Record<string, Node>, id: string): string | null {
  for (const n of Object.values(nodes)) if (n.children.includes(id)) return n.id;
  return null;
}

interface MapNodeProps {
  node: Node;
  box: Box;
  depth: number;
  color: string;
  hidden: number;
  selected: boolean;
  editing: boolean;
  seed: string | null;
  attrNames: Map<string, AttrDef>;
  register: (id: string, el: HTMLDivElement | null) => void;
  onDone: () => void;
}

const MapNode = memo(function MapNode({ node, box, depth, color, hidden, selected, editing, seed, attrNames, register, onDone }: MapNodeProps) {
  const ref = useCallback((el: HTMLDivElement | null) => register(node.id, el), [node.id, register]);
  const chips = Object.entries(node.attrs).filter(([k]) => attrNames.has(k));
  const cls = `mm-node ${depth === 0 ? 'd0' : depth === 1 ? 'd1' : 'dn'}${selected ? ' sel' : ''}`;

  return (
    <div
      ref={ref}
      className={cls}
      style={{ left: box.x, top: box.y, ['--c' as string]: color }}
      onMouseDown={(e) => {
        if (editing) return;
        e.preventDefault();
        useEditor.getState().select(node.id, 'map');
        (e.currentTarget.closest('.mm-viewport') as HTMLElement | null)?.focus({ preventScroll: true });
      }}
      onDoubleClick={() => useEditor.getState().setEditing(node.id)}
    >
      {editing ? <InlineEdit node={node} seed={seed} onDone={onDone} /> : <div className="mm-text">{node.text || <span className="mm-empty">Untitled</span>}</div>}
      {chips.length > 0 && (
        <div className="mm-chips">
          {chips.slice(0, MAX_CHIPS).map(([k, v]) => (
            <span key={k} className="chip">{attrNames.get(k)!.name}: {String(v)}</span>
          ))}
          {chips.length > MAX_CHIPS && <span className="chip more">+{chips.length - MAX_CHIPS}</span>}
        </div>
      )}
      {node.children.length > 0 && depth > 0 && (
        <button
          className={`mm-toggle${node.collapsed ? ' closed' : ''}`}
          title={node.collapsed ? `Show ${hidden} hidden` : 'Collapse'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); useEditor.getState().toggle(node.id); }}
        >
          {node.collapsed ? hidden : '−'}
        </button>
      )}
    </div>
  );
});

function InlineEdit({ node, seed, onDone }: { node: Node; seed: string | null; onDone: () => void }) {
  const [value, setValue] = useState(seed ?? node.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = inputRef.current!;
    el.focus({ preventScroll: true });
    if (seed === null) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [seed]);

  const commit = (after?: 'child' | 'sibling') => {
    if (done.current) return;
    done.current = true;
    const s = useEditor.getState();
    if (value !== node.text) s.setText(node.id, value);
    if (after === 'child') { s.setEditing(s.addChild(node.id)); return; }
    s.setEditing(null);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      className="mm-input"
      value={value}
      size={Math.max(6, value.length + 1)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); setValue(node.text); done.current = true; useEditor.getState().setEditing(null); onDone(); }
        else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); commit('child'); }
      }}
    />
  );
}
