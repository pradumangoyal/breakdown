import { useEffect, useMemo, useRef, useState } from 'react';
import { blankDoc } from '../model/tree';
import {
  StorageError, createMap, deleteMap, duplicateMap, importMap, lastOpened, listMaps, loadMap, renameMap, type MapMeta,
} from '../storage/maps';
import { samples } from '../samples';
import { downloadJson } from './files';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "My maps": create, open, rename, duplicate, export, delete — all stored in this browser. */
export function Home({ open }: { open: (id: string) => void }) {
  const [maps, setMaps] = useState<MapMeta[]>(() => safeList());
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setMaps(safeList());

  // Another tab changed the library: refresh the list.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith('breakdown.')) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const attempt = (fn: () => void) => {
    try { setError(''); fn(); } catch (e) { setError(e instanceof StorageError ? e.message : String(e)); }
  };
  const create = (make: () => Parameters<typeof createMap>[0]) => attempt(() => open(createMap(make()).id));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? maps.filter((m) => m.title.toLowerCase().includes(q)) : maps;
  }, [maps, query]);
  const last = lastOpened();
  const lastMap = maps.find((m) => m.id === last);

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h1>Breakdown</h1>
          <p>Break anything down into a tree, then export it to a Sheet.</p>
        </div>
        <div className="home-actions">
          <button className="primary" onClick={() => create(() => blankDoc('What are you breaking down?'))}>+ New map</button>
          <SampleMenu onPick={(i) => create(() => samples[i].make())} />
          <button onClick={() => fileRef.current?.click()}>Import .json</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) { const text = await f.text(); attempt(() => open(importMap(text).id)); }
          }} />
        </div>
      </header>

      {error && <p className="home-error" role="alert">{error}</p>}

      {lastMap && !query && (
        <button className="home-continue" onClick={() => open(lastMap.id)}>
          <span>Continue where you left off</span>
          <strong>{lastMap.title}</strong>
        </button>
      )}

      {maps.length > 0 ? (
        <>
          <div className="home-bar">
            <h2>My maps <span>{maps.length}</span></h2>
            <input type="search" placeholder="Search maps" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search maps" />
          </div>
          <ul className="home-list">
            {shown.map((m) => (
              <li key={m.id}>
                {renaming === m.id ? (
                  <form className="home-rename" onSubmit={(e) => {
                    e.preventDefault();
                    const v = new FormData(e.currentTarget).get('title') as string;
                    attempt(() => { renameMap(m.id, v); setRenaming(null); refresh(); });
                  }}>
                    <input name="title" defaultValue={m.title} autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                    <button type="submit" className="primary">Save</button>
                    <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <button className="home-open" onClick={() => open(m.id)}>
                    <strong>{m.title}</strong>
                    <span>{m.nodes} node{m.nodes === 1 ? '' : 's'} · edited {ago(m.updatedAt)}</span>
                  </button>
                )}
                {renaming !== m.id && (
                  <div className="home-row-actions">
                    <button onClick={() => setRenaming(m.id)}>Rename</button>
                    <button onClick={() => attempt(() => { duplicateMap(m.id); refresh(); })}>Duplicate</button>
                    <button onClick={() => { const d = loadMap(m.id); if (d) downloadJson(d); }}>Export</button>
                    <button className="danger" onClick={() => {
                      if (window.confirm(`Delete “${m.title}”? This can’t be undone (export it first to keep a copy).`)) attempt(() => { deleteMap(m.id); refresh(); });
                    }}>Delete</button>
                  </div>
                )}
              </li>
            ))}
            {!shown.length && <li className="home-none">No maps match “{query}”.</li>}
          </ul>
        </>
      ) : (
        <div className="home-empty">
          <p>No maps yet.</p>
          <p className="ap-hint">Start a blank map, try a sample, or import a map you exported earlier.</p>
        </div>
      )}

      <footer className="home-foot">
        Maps are saved only in this browser, on this device. Use <b>Export</b> to back one up or move it to another browser.
      </footer>
    </div>
  );
}

function safeList(): MapMeta[] {
  try { return listMaps(); } catch { return []; }
}

function SampleMenu({ onPick }: { onPick: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button aria-expanded={open} onClick={() => setOpen((v) => !v)}>From a sample ▾</button>
      {open && (
        <div className="menu-list" role="menu">
          {samples.map((s, i) => <button key={s.key} role="menuitem" onClick={() => { setOpen(false); onPick(i); }}>{s.label.replace(/^\d+ · /, '')}</button>)}
        </div>
      )}
    </div>
  );
}
