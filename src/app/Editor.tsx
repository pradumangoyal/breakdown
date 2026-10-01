import { Profiler, useEffect, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { flushSave, useEditor, useSaveStatus } from '../model/store';
import { useUi, type MainView } from '../model/ui';
import { deleteMap, duplicateMap, loadMap, setLastOpened } from '../storage/maps';
import { Outline } from '../views/Outline';
import { MapView } from '../views/MapView';
import { AttributePanel } from '../views/AttributePanel';
import { SheetPreview } from '../views/SheetPreview';
import { TableView } from '../views/TableView';
import { StatusBar } from '../views/StatusBar';
import { downloadJson, downloadXlsx } from './files';

// Dev-only render timing per pane, readable from devtools as window.__prof.
const prof: ProfilerOnRenderCallback = (id, phase, actual) => {
  const w = window as unknown as { __prof?: Array<[string, string, number]> };
  (w.__prof ??= []).push([id, phase, Math.round(actual * 10) / 10]);
  if (w.__prof.length > 500) w.__prof.shift();
};

const typingInField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');

const VIEWS: Array<{ key: MainView; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'table', label: 'Table' },
  { key: 'sheet', label: 'Sheet' },
];

/** The editor for one map from the library. */
export function Editor({ mapId, goHome, open }: { mapId: string; goHome: () => void; open: (id: string) => void }) {
  const doc = useEditor((s) => s.doc);
  const saveError = useSaveStatus((s) => s.error);
  const [missing, setMissing] = useState(false);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { view, outlineOpen, attrsOpen, focus, helpOpen } = useUi();
  const ui = useUi.getState;

  useEffect(() => {
    flushSave();
    const loaded = loadMap(mapId);
    if (!loaded) { setMissing(true); return; }
    setMissing(false);
    useEditor.getState().load(loaded);
    setLastOpened(mapId);
    return () => flushSave(); // leaving the map: write any last edit right away
  }, [mapId]);

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

  const xlsx = () => { downloadXlsx(useEditor.getState().doc).catch((e) => window.alert(`Could not build the .xlsx: ${(e as Error).message}`)); };
  const duplicate = () => { flushSave(); const copy = duplicateMap(mapId); if (copy) open(copy.id); };
  const remove = () => {
    if (!window.confirm('Delete this map? This can’t be undone (export it first to keep a copy).')) return;
    deleteMap(mapId);
    goHome();
  };

  if (missing) {
    return (
      <div className="home"><div className="home-empty">
        <p>This map isn’t saved in this browser.</p>
        <p className="ap-hint">Maps live only in the browser where you made them. Export it there and import it here.</p>
        <button className="primary" onClick={goHome}>Go to My maps</button>
      </div></div>
    );
  }
  if (doc.id !== mapId) return null; // still loading

  const main =
    view === 'map' ? <Profiler id="map" onRender={prof}><MapView /></Profiler>
    : view === 'table' ? <Profiler id="table" onRender={prof}><TableView onAddAttribute={() => useUi.setState({ attrsOpen: true })} /></Profiler>
    : <Profiler id="sheet" onRender={prof}><SheetPreview onDownload={xlsx} /></Profiler>;

  const showOutline = outlineOpen && !focus;
  const showAttrs = attrsOpen && !focus;

  return (
    <div className={`app${focus ? ' focus' : ''}`}>
      {!focus && (
        <header className="topbar">
          <button className="back" onClick={goHome} title="All your maps">← My maps</button>
          <FileMenu onExport={() => downloadJson(useEditor.getState().doc)} onXlsx={xlsx} onDuplicate={duplicate} onDelete={remove} />
          <button className="icon" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (⌘Z)" aria-label="Undo">↶</button>
          <button className="icon" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
          <span className={`stat${saveError ? ' err' : ''}`} title={saveError ?? 'Saved in this browser'}>{saveError ? `⚠ ${saveError}` : `${Object.keys(doc.nodes).length} nodes · saved`}</span>
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

function FileMenu({ onExport, onXlsx, onDuplicate, onDelete }: { onExport: () => void; onXlsx: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
          <button role="menuitem" onClick={pick(onExport)}>Export as .json (backup / share)</button>
          <button role="menuitem" onClick={pick(onXlsx)}>Download Sheet as .xlsx</button>
          <button role="menuitem" onClick={pick(onDuplicate)}>Duplicate this map</button>
          <button role="menuitem" className="danger" onClick={pick(onDelete)}>Delete this map…</button>
        </div>
      )}
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
            <dt>⇧Enter / ⌃Enter / F2 / Space</dt><dd>Edit the selected node</dd>
            <dt>While writing new</dt><dd>Enter → next sibling · empty Enter / Esc → stop</dd>
            <dt>⇧Enter / ⌃Enter (editing)</dt><dd>Line break</dd>
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
            <dt>⇧Enter / ⌃Enter</dt><dd>Line break inside the item</dd>
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
