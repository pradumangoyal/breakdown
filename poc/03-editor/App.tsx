import { Profiler, useEffect, useState, type ProfilerOnRenderCallback } from 'react';
import { loadSaved, useEditor } from '../../src/model/store';
import { blankDoc } from '../../src/model/tree';
import type { MapDoc } from '../../src/model/types';
import { treeToGrid } from '../../src/export/grid';
import { gridToWorkbook } from '../../src/export/xlsx';
import { Outline } from '../../src/views/Outline';
import { MapView } from '../../src/views/MapView';
import { AttributePanel } from '../../src/views/AttributePanel';
import { SheetPreview } from '../../src/views/SheetPreview';
import { TableView } from '../../src/views/TableView';
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
if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

const fileName = (doc: MapDoc) => (doc.nodes[doc.rootId].text.trim() || 'breakdown').replace(/[^\w\- ]+/g, '').slice(0, 60);

export function App() {
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [showSheet, setShowSheet] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showAttrs, setShowAttrs] = useState(() => window.innerWidth >= 1000);
  const [view, setViewState] = useState<'map' | 'table'>(() => {
    try { return localStorage.getItem('mindmap.view') === 'table' ? 'table' : 'map'; } catch { return 'map'; }
  });
  const setView = (v: 'map' | 'table') => {
    setViewState(v);
    try { localStorage.setItem('mindmap.view', v); } catch { /* per-viewer preference only */ }
  };

  useEffect(() => {
    const saved = loadSaved();
    useEditor.getState().load(saved ?? problemTree());
  }, []);

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

  return (
    <div className="app">
      <header className="topbar">
        <h1>Mind map · POC-C</h1>
        <select value="" onChange={(e) => e.target.value && replace(SAMPLES[e.target.value].make())} aria-label="Load a sample">
          <option value="">Load sample…</option>
          {Object.entries(SAMPLES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <button onClick={saveJson}>Save .json</button>
        <label className="btn">Open .json<input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) openJson(f); e.target.value = ''; }} /></label>
        <button disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (⌘Z)">Undo</button>
        <button disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (⇧⌘Z)">Redo</button>
        <span className="stat">{Object.keys(doc.nodes).length} nodes · autosaved in this browser</span>
        <span className="spacer" />
        <span className="seg" role="group" aria-label="View">
          <button className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button>
          <button className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </span>
        <button className={showSheet ? 'on' : ''} onClick={() => setShowSheet((v) => !v)}>Sheet preview</button>
        <button className={showAttrs ? 'on' : ''} onClick={() => setShowAttrs((v) => !v)}>Attributes</button>
        <button className={showHelp ? 'on' : ''} onClick={() => setShowHelp((v) => !v)}>Keys</button>
      </header>
      {showHelp && <KeyHelp />}
      <div className={`body${showAttrs ? '' : ' no-attrs'}`}>
        <Profiler id="outline" onRender={prof}><Outline /></Profiler>
        <div className={`center${showSheet ? ' with-sheet' : ''}`}>
          {view === 'map'
            ? <Profiler id="map" onRender={prof}><MapView /></Profiler>
            : <Profiler id="table" onRender={prof}><TableView onAddAttribute={() => setShowAttrs(true)} /></Profiler>}
          {showSheet && <Profiler id="sheet" onRender={prof}><SheetPreview onDownload={downloadXlsx} /></Profiler>}
        </div>
        <Profiler id="attrs" onRender={prof}><AttributePanel /></Profiler>
      </div>
    </div>
  );
}

function KeyHelp() {
  return (
    <div className="help">
      <div className="cols">
        <div>
          <h4>Outline</h4>
          <dl>
            <dt>Enter</dt><dd>New item below (first child if expanded)</dd>
            <dt>⇧Enter</dt><dd>Line break inside the item</dd>
            <dt>Tab / ⇧Tab</dt><dd>Indent / outdent</dd>
            <dt>↑ / ↓</dt><dd>Previous / next item</dd>
            <dt>⌥↑ / ⌥↓</dt><dd>Move up / down</dd>
            <dt>⌘↑ / ⌘↓</dt><dd>Collapse / expand</dd>
            <dt>⌫ on empty</dt><dd>Delete item</dd>
            <dt>⇧⌘⌫</dt><dd>Delete item with children</dd>
          </dl>
        </div>
        <div>
          <h4>Map</h4>
          <dl>
            <dt>Tab</dt><dd>Add child</dd>
            <dt>Enter</dt><dd>Add sibling (while editing: finish)</dd>
            <dt>⇧Enter</dt><dd>Line break while editing</dd>
            <dt>Type / F2 / Space</dt><dd>Edit (typing replaces)</dd>
            <dt>Arrows</dt><dd>Parent · child · siblings</dd>
            <dt>⌥↑ / ⌥↓</dt><dd>Move up / down</dd>
            <dt>⌘↑ / ⌘↓</dt><dd>Collapse / expand</dd>
            <dt>⌫</dt><dd>Delete with children</dd>
            <dt>Drag · scroll · pinch</dt><dd>Pan · pan · zoom</dd>
          </dl>
        </div>
      </div>
      <h4 style={{ marginTop: 12 }}>Table</h4>
      <dl>
        <dt>Tab / ⇧Tab</dt><dd>Next / previous cell (skips cells that don't apply)</dd>
        <dt>Enter / ↓</dt><dd>Same column, next row</dd>
        <dt>⇧Enter / ↑</dt><dd>Same column, previous row</dd>
      </dl>
      <p className="ap-hint" style={{ margin: '10px 0 0' }}>⌘Z / ⇧⌘Z undo and redo everywhere.</p>
    </div>
  );
}
