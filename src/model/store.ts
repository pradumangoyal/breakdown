import { create } from 'zustand';
import { produce } from 'immer';
import type { AttrDef, AttrScope, AttrValue, MapDoc } from './types';
import * as T from './tree';

/**
 * One store feeds both views (outline + map), so they can never disagree.
 * Every change goes through `apply`, which records undo history. Consecutive text
 * edits on the same node are merged into one undo step.
 */

/** 'outline' = typing in an outline row; 'outlineNav' = outline row selected, not editing (after Esc). */
export type FocusArea = 'outline' | 'outlineNav' | 'map' | 'table';

interface EditorState {
  doc: MapDoc;
  selectedId: string;
  /** Node being edited inline in the map (the outline is always editable). */
  editingId: string | null;
  focusArea: FocusArea;
  past: MapDoc[];
  future: MapDoc[];
}

interface EditorActions {
  load(doc: MapDoc): void;
  select(id: string, area?: FocusArea): void;
  setEditing(id: string | null): void;
  setFocusArea(area: FocusArea): void;
  undo(): void;
  redo(): void;
  addChild(id: string): string;
  /** `outliner`: on an expanded node with children, add its first child instead (Workflowy-style Enter). */
  addSibling(id: string, outliner?: boolean): string;
  indent(id: string): void;
  outdent(id: string): void;
  move(id: string, delta: -1 | 1): void;
  remove(id: string): void;
  /** Drops a node that was just created and left empty, undoing its creation (no extra undo step). */
  discardNew(id: string): void;
  setText(id: string, text: string): void;
  toggle(id: string, collapsed?: boolean): void;
  setAttr(id: string, attrId: string, value: AttrValue | undefined): void;
  addAttribute(name: string, type?: 'text' | 'number', scope?: AttrScope): string;
  updateAttribute(id: string, patch: Partial<Omit<AttrDef, 'id'>>): void;
  removeAttribute(id: string): void;
  moveAttribute(id: string, delta: -1 | 1): void;
  setLevelName(level: number, name: string): void;
  setNumbering(on: boolean): void;
}

const HISTORY = 200;
const COALESCE_MS = 1200;
let lastEdit: { key: string; at: number } | null = null;
/** The first text typed into a just-created node joins the creation's undo step (no empty node left behind on undo). */
const mergeNextText = (id: string) => { lastEdit = { key: `text:${id}`, at: Number.POSITIVE_INFINITY }; };

export const useEditor = create<EditorState & EditorActions>()((set, get) => {
  /** Runs a recipe on a draft; records history unless merged into the previous text edit. */
  const apply = (recipe: (d: MapDoc) => void, coalesceKey?: string) => {
    const { doc, past } = get();
    const next = produce(doc, (d) => {
      recipe(d);
      d.updatedAt = new Date().toISOString();
    });
    if (next === doc) return;
    const now = Date.now();
    const merge = coalesceKey && lastEdit?.key === coalesceKey && (lastEdit.at === Number.POSITIVE_INFINITY || now - lastEdit.at < COALESCE_MS);
    lastEdit = coalesceKey ? { key: coalesceKey, at: now } : null;
    set({ doc: next, past: merge ? past : [...past.slice(-HISTORY + 1), doc], future: [] });
  };

  return {
    doc: T.blankDoc(),
    selectedId: '',
    editingId: null,
    focusArea: 'outline',
    past: [],
    future: [],

    load: (doc) => {
      lastEdit = null;
      set({ doc, selectedId: doc.rootId, editingId: null, past: [], future: [] });
    },
    select: (id, area) => set(area ? { selectedId: id, focusArea: area } : { selectedId: id }),
    setEditing: (id) => set({ editingId: id }),
    setFocusArea: (area) => set({ focusArea: area }),

    undo: () => {
      const { past, doc, future, selectedId } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      lastEdit = null;
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selectedId: prev.nodes[selectedId] ? selectedId : prev.rootId, editingId: null });
    },
    redo: () => {
      const { past, doc, future, selectedId } = get();
      if (!future.length) return;
      const next = future[0];
      lastEdit = null;
      set({ doc: next, past: [...past, doc], future: future.slice(1), selectedId: next.nodes[selectedId] ? selectedId : next.rootId, editingId: null });
    },

    addChild: (id) => {
      let created = '';
      apply((d) => { created = T.addChild(d, id); });
      mergeNextText(created);
      set({ selectedId: created });
      return created;
    },
    addSibling: (id, outliner = false) => {
      let created = '';
      apply((d) => {
        const n = d.nodes[id];
        created = outliner && n.children.length && !n.collapsed ? T.addChild(d, id, 0) : T.addSiblingAfter(d, id);
      });
      mergeNextText(created);
      set({ selectedId: created });
      return created;
    },
    indent: (id) => apply((d) => { T.indent(d, id); }),
    outdent: (id) => apply((d) => { T.outdent(d, id); }),
    move: (id, delta) => apply((d) => { T.moveAmongSiblings(d, id, delta); }),
    remove: (id) => {
      let next: string | null = null;
      apply((d) => { next = T.remove(d, id); });
      if (next) set({ selectedId: next, editingId: null });
    },
    discardNew: (id) => {
      const { doc, past } = get();
      const n = doc.nodes[id];
      if (!n || n.text.trim() || n.children.length) return;
      const { visible } = T.indexTree(doc);
      const next = visible[visible.indexOf(id) - 1] ?? doc.rootId;
      const prev = past[past.length - 1];
      lastEdit = null;
      // Created in the very last step: step back instead of recording a delete.
      const selected = get().selectedId;
      const keep = selected !== id && prev?.nodes[selected] ? selected : null;
      if (prev && !prev.nodes[id]) set({ doc: prev, past: past.slice(0, -1), selectedId: keep ?? (prev.nodes[next] ? next : prev.rootId), editingId: null });
      else {
        get().remove(id);
        if (keep) set({ selectedId: keep });
      }
    },
    setText: (id, text) => apply((d) => T.setText(d, id, text), `text:${id}`),
    toggle: (id, collapsed) => apply((d) => T.setCollapsed(d, id, collapsed ?? !d.nodes[id].collapsed)),
    setAttr: (id, attrId, value) => apply((d) => T.setAttr(d, id, attrId, value), `attr:${id}:${attrId}`),
    addAttribute: (name, type, scope) => {
      let attrId = '';
      apply((d) => { attrId = T.addAttribute(d, name, type, scope); });
      return attrId;
    },
    updateAttribute: (id, patch) => apply((d) => T.updateAttribute(d, id, patch)),
    removeAttribute: (id) => apply((d) => T.removeAttribute(d, id)),
    moveAttribute: (id, delta) => apply((d) => T.moveAttribute(d, id, delta)),
    setLevelName: (level, name) => apply((d) => {
      while (d.levelNames.length < level) d.levelNames.push('');
      d.levelNames[level - 1] = name;
    }, `level:${level}`),
    setNumbering: (on) => apply((d) => { d.settings.numbering = on; }),
  };
});

/** Autosave to this browser. Wrapped in try/catch: storage can be unavailable (private mode). */
const KEY = 'mindmap.doc.v1';
export function loadSaved(): MapDoc | null {
  try {
    const raw = localStorage.getItem(KEY);
    const doc = raw ? (JSON.parse(raw) as MapDoc) : null;
    return doc && doc.version === 1 && doc.nodes[doc.rootId] ? doc : null;
  } catch {
    return null;
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s.doc)); } catch { /* storage unavailable */ }
  }, 400);
});
