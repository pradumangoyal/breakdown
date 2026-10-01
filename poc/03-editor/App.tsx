import { Profiler, useEffect, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { loadSaved, useEditor } from '../../src/model/store';
import { useUi, type MainView } from '../../src/model/ui';
import { blankDoc } from '../../src/model/tree';
import type { MapDoc } from '../../src/model/types';
import { treeToGrid } from '../../src/export/grid';
import { gridToWorkbook } from '../../src/export/xlsx';
import { Outline } from '../../src/views/Outline';
import { MapView } from '../../src/views/MapView';
import { AttributePanel } from '../../src/views/AttributePanel';
import { SheetPreview } from '../../src/views/SheetPreview';
import { TableView } from '../../src/views/TableView';
import { StatusBar } from '../../src/views/StatusBar';
import { problemTree, randomTree, wbs } from '../01-sheet-layout/samples';
import '../../src/views/editor.css';

const SAMPLES: Record<string, { label: string; make: () => MapDoc }> = {
  problem: { label: 'Problem tree (7 nodes)', make: problemTree },
  wbs: { label: 'Work breakdown (38 nodes)', make: wbs },
  r150: { label: 'Random, 150 nodes, depth 6', make: () => randomTree(150, 6, 5) },
  r1000: { label: 'Random, 1,000 nodes, depth 10', make: () => randomTree(1000, 10, 7) },
  blank: { label: 'Blank map', make: () => blankDoc('What are you breaking down?') },
};

function downloadBlob(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Dev-only render timing per pane, readable from devtools as window.__prof.
const prof: ProfilerOnRenderCallback = (id, phase, actual) => {
  const w = window as unknown as { __prof?: Array<[string, string, number]> };
  (w.__prof ??= []).push([id, phase, Math.round(actual * 10) / 10]);
  if (w.__prof.length > 500) w.__prof.shift();
};
if (import.meta.env.DEV) Object.assign(window, { __editor: useEditor, __ui: useUi });

const fileName = (doc: MapDoc) => (doc.nodes[doc.rootId].text.trim() || 'breakdown').replace(/[^\w\- ]+/g, '').slice(0, 60);
const typingInField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');

const VIEWS: Array<{ key: MainView; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'table', label: 'Table' },
  { key: 'sheet', label: 'Sheet' },
];

export function App() {
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { view, outlineOpen, attrsOpen, focus, helpOpen } = useUi();
  const ui = useUi.getState;

  useEffect(() => {
    useEditor.getState().load(loadSaved() ?? problemTree());
  }, []);

  // Single-key shortcuts when you're not typing: O outline, A attributes, F focus mode, ? keys.
  // Esc with nothing selected leaves focus mode (map / outline handle Esc first: stop editing, deselect).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingInField(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'o') ui().toggleOutline();
      else if (k === 'a') ui().toggleAttrs();
      else if (k === 'f') ui().setFocus(!ui().focus);
      else if (e.key === '?') ui().toggleHelp();
      else if (e.key === 'Escape' && ui().helpOpen) ui().toggleHelp();
      else if (e.key === 'Escape' && ui().focus && !useEditor.getState().selectedId) ui().setFocus(false);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui]);

  const replace = (next: MapDoc) => {
    const edited = useEditor.getState().past.length > 0;
    if (edited && !window.confirm('Replace the current map? It is only saved in this browser (use “Save .json” to keep a copy).')) return;
    useEditor.getState().load(next);
  };
  const saveJson = () => downloadBlob(JSON.stringify(doc, null, 2), 'application/json', `${fileName(doc)}.json`);
  const openJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as MapDoc;
      if (parsed.version !== 1 || !parsed.nodes?.[parsed.rootId]) throw new Error('Not a mind-map file');
      replace(parsed);
    } catch (e) {
      window.alert(`Could not open that file: ${(e as Error).message}`);
    }
  };
  const downloadXlsx = async () => {
    const buf = await gridToWorkbook(treeToGrid(doc)).xlsx.writeBuffer();
    downloadBlob(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${fileName(doc)}.xlsx`);
  };

  const main =
    view === 'map' ? <Profiler id="map" onRender={prof}><MapView /></Profiler>
    : view === 'table' ? <Profiler id="table" onRender={prof}><TableView onAddAttribute={() => useUi.setState({ attrsOpen: true })} /></Profiler>
    : <Profiler id="sheet" onRender={prof}><SheetPreview onDownload={downloadXlsx} /></Profiler>;

  const showOutline = outlineOpen && !focus;
  const showAttrs = attrsOpen && !focus;

  return (
    <div className={`app${focus ? ' focus' : ''}`}>
      {!focus && (
        <header className="topbar">
          <h1>Mind map</h1>
          <FileMenu samples={SAMPLES} onSample={(k) => replace(SAMPLES[k].make())} onSave={saveJson} onOpen={openJson} onXlsx={downloadXlsx} />
          <button className="icon" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (⌘Z)" aria-label="Undo">↶</button>
          <button className="icon" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
          <span className="stat">{Object.keys(doc.nodes).length} nodes · autosaved</span>
          <span className="spacer" />
          <span className="seg" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} className={view === v.key ? 'on' : ''} aria-pressed={view === v.key} onClick={() => ui().setView(v.key)}>{v.label}</button>
            ))}
          </span>
          <button className={outlineOpen ? 'on' : ''} aria-pressed={outlineOpen} onClick={() => ui().toggleOutline()} title="Show / hide the outline (O)">Outline</button>
          <button className={attrsOpen ? 'on' : ''} aria-pressed={attrsOpen} onClick={() => ui().toggleAttrs()} title="Show / hide attributes (A)">Attributes</button>
          <button onClick={() => ui().setFocus(true)} title="Focus mode: only the map (F)">Focus</button>
          <button className={helpOpen ? 'on' : ''} onClick={() => ui().toggleHelp()} title="Keyboard shortcuts (?)">Keys</button>
        </header>
      )}
      {helpOpen && <KeyHelp />}
      <div className="body" style={{ gridTemplateColumns: `${showOutline ? 'minmax(240px, 300px) ' : ''}minmax(0, 1fr)${showAttrs ? ' minmax(240px, 290px)' : ''}` }}>
        {showOutline && <Profiler id="outline" onRender={prof}><Outline /></Profiler>}
        <main className="main">{main}</main>
        {showAttrs && <Profiler id="attrs" onRender={prof}><AttributePanel /></Profiler>}
      </div>
      {focus && <button className="focus-exit" onClick={() => ui().setFocus(false)} title="Leave focus mode (F, or Esc with nothing selected)">Exit focus</button>}
      <StatusBar />
    </div>
  );
}

function FileMenu({ samples, onSample, onSave, onOpen, onXlsx }: {
  samples: Record<string, { label: string }>;
  onSample: (key: string) => void;
  onSave: () => void;
  onOpen: (f: File) => void;
  onXlsx: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="menu" ref={ref}>
      <button className={open ? 'on' : ''} aria-expanded={open} onClick={() => setOpen((v) => !v)}>File ▾</button>
      {open && (
        <div className="menu-list" role="menu">
          <button role="menuitem" onClick={pick(onSave)}>Save as .json</button>
          <button role="menuitem" onClick={pick(() => file.current?.click())}>Open .json…</button>
          <button role="menuitem" onClick={pick(onXlsx)}>Download Sheet as .xlsx</button>
          <div className="menu-sep">Load a sample</div>
          {Object.entries(samples).map(([k, s]) => <button key={k} role="menuitem" onClick={pick(() => onSample(k))}>{s.label}</button>)}
        </div>
      )}
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onOpen(f); e.target.value = ''; }} />
    </div>
  );
}

function KeyHelp() {
  return (
    <div className="help">
      <div className="cols">
        <div>
          <h4>Map</h4>
          <dl>
            <dt>Enter</dt><dd>Add sibling below</dd>
            <dt>Tab</dt><dd>Add child</dd>
            <dt>⇧Enter / F2 / Space</dt><dd>Edit the selected node</dd>
            <dt>While writing new</dt><dd>Enter → next sibling · empty Enter / Esc → stop</dd>
            <dt>⇧Enter (editing)</dt><dd>Line break</dd>
            <dt>← / →</dt><dd>Parent / first child</dd>
            <dt>↑ / ↓</dt><dd>Next logical node: sibling, else the next branch at this level, else that branch</dd>
            <dt>Drag a node</dt><dd>Onto a node: move under it · near its top / bottom edge: place above / below</dd>
            <dt>⌥↑ / ⌥↓</dt><dd>Move up / down</dd>
            <dt>⌘↑ / ⌘↓</dt><dd>Collapse / expand</dd>
            <dt>⌫</dt><dd>Delete with children</dd>
            <dt>Esc</dt><dd>Stop editing · again: deselect · again: leave focus mode</dd>
          </dl>
        </div>
        <div>
          <h4>Outline (O)</h4>
          <dl>
            <dt>Enter</dt><dd>New item below (first child if expanded)</dd>
            <dt>⇧Enter</dt><dd>Line break inside the item</dd>
            <dt>Tab / ⇧Tab</dt><dd>Indent / outdent</dd>
            <dt>↑ / ↓</dt><dd>Previous / next item</dd>
            <dt>Drag the bullet</dt><dd>Move the item (onto a row: under it)</dd>
            <dt>⌥↑ / ⌥↓</dt><dd>Move up / down</dd>
            <dt>⌘↑ / ⌘↓</dt><dd>Collapse / expand</dd>
            <dt>Esc</dt><dd>Stop editing (↑↓ move, ⇧Enter edit, Esc deselect)</dd>
            <dt>⌫ on empty</dt><dd>Delete item</dd>
          </dl>
          <h4 style={{ marginTop: 12 }}>Anywhere (not typing)</h4>
          <dl>
            <dt>O · A · F</dt><dd>Outline · Attributes · Focus mode</dd>
            <dt>?</dt><dd>This list</dd>
            <dt>⌘Z / ⇧⌘Z</dt><dd>Undo / redo</dd>
          </dl>
          <h4 style={{ marginTop: 12 }}>Table</h4>
          <dl>
            <dt>Tab / ⇧Tab</dt><dd>Next / previous cell</dd>
            <dt>Enter / ↓ · ⇧Enter / ↑</dt><dd>Next row · previous row</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
