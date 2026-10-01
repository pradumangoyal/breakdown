import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom';
import { useEditor } from '../model/store';
import { countDescendants } from '../model/tree';
import type { AttrDef, Node } from '../model/types';
import { levelName } from '../export/grid';
import { H_GAP, PAD, layoutMap, type Box, type Size } from './layout';
import { AutoTextarea } from './AutoTextarea';

const BRANCH_COLORS = ['#2f6fdf', '#d9480f', '#2b8a3e', '#9c36b5', '#c2255c', '#0c8599', '#e67700', '#5f3dc4'];
const colorOf = (b: number) => (b < 0 ? '#495057' : BRANCH_COLORS[b % BRANCH_COLORS.length]);

/** Size guess before a node has been measured (first frame only). */
const estimate = (n: Node, depth: number): Size => ({
  w: Math.min(260, 22 + n.text.length * (depth === 0 ? 10 : 7.4)),
  h: depth === 0 ? 44 : 30,
});

const isMod = (e: React.KeyboardEvent | KeyboardEvent) => e.metaKey || e.ctrlKey;

export type Connector = 'elbow' | 'curved' | 'straight';

/** Per-viewer map preferences, remembered in this browser (falls back to defaults if storage is unavailable). */
function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* preference just won't persist */ }
  };
  return [value, set];
}

/**
 * Connector from a parent's right edge to a child's left edge, as [shared part, child part].
 * For elbows the shared part (out of the parent + the vertical spine) is drawn in the
 * parent's colour, so a spine shared by siblings of different branches stays one colour.
 */
function edgePaths(style: Connector, x1: number, y1: number, x2: number, y2: number): [string, string] {
  // The bend always happens in the last H_GAP before the child's column, so with level
  // columns every spine of a level lines up; a wide gap after a short parent is a straight run.
  const bx = x2 - H_GAP;
  const mx = x2 - H_GAP / 2;
  const run = bx > x1 + 0.5 ? `M${x1},${y1} H${bx} ` : `M${x1},${y1} `;
  if (style === 'straight') return ['', `${run}L${x2},${y2}`];
  if (style === 'curved') return ['', `${run}C${mx},${y1} ${mx},${y2} ${x2},${y2}`];
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return [`M${x1},${y1} H${mx}`, `M${mx},${y2} H${x2}`];
  const r = Math.min(8, Math.abs(dy) / 2, H_GAP / 2);
  const s = Math.sign(dy);
  return [
    `M${x1},${y1} H${mx - r} Q${mx},${y1} ${mx},${y1 + s * r} V${y2 - s * r}`,
    `M${mx},${y2 - s * r} Q${mx},${y2} ${mx + r},${y2} H${x2}`,
  ];
}

export function MapView() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const editingId = useEditor((s) => s.editingId);
  const [sizes, setSizes] = useState(() => new Map<string, Size>());
  /** First keystroke when typing over a selected node, tied to that node. */
  const [seed, setSeed] = useState<{ id: string; text: string } | null>(null);
  const [connector, setConnector] = usePref<Connector>('mindmap.connector', 'elbow', ['elbow', 'curved', 'straight']);
  const [arrange, setArrange] = usePref('mindmap.arrange', 'columns', ['columns', 'compact'] as const);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown>>();
  const nodeEls = useRef(new Map<string, HTMLDivElement>());
  const needsFit = useRef(true);
  const boxCache = useRef(new Map<string, Box>());

  const layout = useMemo(() => {
    const l = layoutMap(doc, (id, d) => sizes.get(id) ?? estimate(doc.nodes[id], d), { alignLevels: arrange === 'columns' });
    // Reuse unchanged box objects so memoised nodes that didn't move skip re-rendering.
    const stable = new Map<string, Box>();
    for (const [id, b] of l.boxes) {
      const old = boxCache.current.get(id);
      stable.set(id, old && old.x === b.x && old.y === b.y && old.w === b.w && old.h === b.h ? old : b);
    }
    boxCache.current = stable;
    l.boxes = stable;
    return l;
  }, [doc, sizes, arrange]);

  /**
   * Selected-path highlight: the chain from the centre to the selected node is bold,
   * the selected node's own (visible) subtree stays normal, everything else dims.
   * Nothing dims while the central node is selected.
   */
  const focus = useMemo(() => {
    if (!layout.boxes.has(selectedId) || selectedId === doc.rootId) return null;
    const path = new Set<string>();
    for (let id: string | null = selectedId; id; id = layout.parent.get(id) ?? null) path.add(id);
    const below = new Set<string>();
    const walk = (id: string) => {
      if (doc.nodes[id].collapsed) return;
      for (const c of doc.nodes[id].children) { below.add(c); walk(c); }
    };
    walk(selectedId);
    return { path, below };
  }, [layout, selectedId, doc]);
  const edgeMode = (to: string): EdgeMode => (!focus ? 'normal' : focus.path.has(to) ? 'path' : focus.below.has(to) ? 'normal' : 'dim');

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
          {(focus ? [...layout.edges].sort((p, q) => EDGE_ORDER[edgeMode(p.to)] - EDGE_ORDER[edgeMode(q.to)]) : layout.edges).map(({ from, to }) => {
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
                parentColor={colorOf(layout.branch.get(from)!)}
                width={layout.depth.get(to) === 1 ? 2.2 : 1.5}
                style={connector}
                mode={edgeMode(to)}
              />
            );
          })}
        </svg>
        {arrange === 'columns' &&
          layout.columns.slice(1).map((x, i) => (
            <div key={i} className="mm-col-label" style={{ left: x, top: PAD - 40 }}>{levelName(doc, i + 1)}</div>
          ))}
        {[...layout.boxes].map(([id, box]) => (
          <MapNode
            key={id}
            node={doc.nodes[id]}
            box={box}
            depth={layout.depth.get(id)!}
            color={colorOf(layout.branch.get(id)!)}
            hidden={doc.nodes[id].collapsed ? countDescendants(doc, id) : 0}
            selected={id === selectedId}
            dim={!!focus && !focus.path.has(id) && !focus.below.has(id)}
            editing={id === editingId}
            seed={id === editingId && seed?.id === id ? seed.text : null}
            attrNames={attrNames}
            register={register}
            onDone={endEdit}
          />
        ))}
      </div>
      <div className="mm-tools">
        <button className={arrange === 'columns' ? 'on' : ''} aria-pressed={arrange === 'columns'} title="Line up each level in its own column, like the Sheet" onClick={() => setArrange(arrange === 'columns' ? 'compact' : 'columns')}>Columns</button>
        <select value={connector} onChange={(e) => setConnector(e.target.value as Connector)} title="Line style" aria-label="Line style">
          <option value="elbow">Elbow lines</option>
          <option value="curved">Curved lines</option>
          <option value="straight">Straight lines</option>
        </select>
        <button title="Zoom in" onClick={() => zoomRef.current!.scaleBy(select(viewportRef.current!), 1.25)}>+</button>
        <button title="Zoom out" onClick={() => zoomRef.current!.scaleBy(select(viewportRef.current!), 0.8)}>−</button>
        <button title="Show the whole map" onClick={() => fit(true)}>Fit</button>
      </div>
    </div>
  );
}

type EdgeMode = 'path' | 'normal' | 'dim';
const EDGE_ORDER: Record<EdgeMode, number> = { dim: 0, normal: 1, path: 2 };

interface EdgeProps { x1: number; y1: number; x2: number; y2: number; color: string; parentColor: string; width: number; style: Connector; mode: EdgeMode }
const Edge = memo(function Edge({ x1, y1, x2, y2, color, parentColor, width, style, mode }: EdgeProps) {
  const [shared, own] = edgePaths(style, x1, y1, x2, y2);
  return (
    <g fill="none" strokeWidth={mode === 'path' ? width + 1.3 : width} opacity={mode === 'dim' ? 0.28 : 1} strokeLinejoin="round" strokeLinecap="round">
      {shared && <path d={shared} stroke={parentColor} />}
      <path d={own} stroke={color} />
    </g>
  );
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
  dim: boolean;
  editing: boolean;
  seed: string | null;
  attrNames: Map<string, AttrDef>;
  register: (id: string, el: HTMLDivElement | null) => void;
  onDone: () => void;
}

const MapNode = memo(function MapNode({ node, box, depth, color, hidden, selected, dim, editing, seed, attrNames, register, onDone }: MapNodeProps) {
  const ref = useCallback((el: HTMLDivElement | null) => register(node.id, el), [node.id, register]);
  const chips = Object.entries(node.attrs).filter(([k, v]) => attrNames.has(k) && String(v).trim() !== '');
  const cls = `mm-node ${depth === 0 ? 'd0' : depth === 1 ? 'd1' : 'dn'}${selected ? ' sel' : ''}${dim ? ' dim' : ''}`;
  const summary = chips.map(([k, v]) => `${attrNames.get(k)!.name}: ${String(v)}`);

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
      <div className="mm-row">
        {editing ? <InlineEdit node={node} seed={seed} onDone={onDone} /> : <div className="mm-text">{node.text || <span className="mm-empty">Untitled</span>}</div>}
        {/* A count keeps every node the same size; full values float below the selected node. */}
        {chips.length > 0 && <span className="mm-badge" title={summary.join('\n')}>{chips.length}</span>}
      </div>
      {selected && chips.length > 0 && (
        <div className="mm-pop">
          {summary.map((line) => <span key={line} className="chip">{line}</span>)}
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    <AutoTextarea
      ref={inputRef}
      className="mm-input"
      value={value}
      cols={Math.max(6, ...value.split('\n').map((l) => l.length + 1))}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); } // Shift+Enter = line break
        else if (e.key === 'Escape') { e.preventDefault(); setValue(node.text); done.current = true; useEditor.getState().setEditing(null); onDone(); }
        else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); commit('child'); }
      }}
    />
  );
}
