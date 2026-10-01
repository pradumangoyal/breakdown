import { create } from 'zustand';

/**
 * Screen layout, per viewer (remembered in this browser, never part of the map file).
 * The map is the main view; the outline and attribute panels are toggles; focus mode hides
 * everything but the main view and the status bar.
 */
export type MainView = 'map' | 'table' | 'sheet';

interface UiState {
  view: MainView;
  outlineOpen: boolean;
  attrsOpen: boolean;
  focus: boolean;
  helpOpen: boolean;
  setView(v: MainView): void;
  toggleOutline(): void;
  toggleAttrs(): void;
  setFocus(on: boolean): void;
  toggleHelp(): void;
}

const KEY = 'mindmap.ui.v1';
type Saved = Pick<UiState, 'view' | 'outlineOpen' | 'attrsOpen'>;

function load(): Saved {
  const fallback: Saved = { view: 'map', outlineOpen: false, attrsOpen: typeof window !== 'undefined' && window.innerWidth >= 1100 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return raw ? { ...fallback, ...raw } : fallback;
  } catch {
    return fallback;
  }
}

export const useUi = create<UiState>()((set) => ({
  ...load(),
  focus: false,
  helpOpen: false,
  setView: (view) => set({ view }),
  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
  toggleAttrs: () => set((s) => ({ attrsOpen: !s.attrsOpen })),
  setFocus: (focus) => set({ focus, helpOpen: false }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
}));

useUi.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ view: s.view, outlineOpen: s.outlineOpen, attrsOpen: s.attrsOpen })); } catch { /* not persisted */ }
});
