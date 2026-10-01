import { useEffect, useState } from 'react';
import { Home } from './Home';
import { Editor } from './Editor';
import { useEditor } from '../model/store';
import { useUi } from '../model/ui';

/** Tiny hash router: #/ → My maps, #/map/<id> → editor. Works on static hosting (GitHub Pages). */
function useRoute() {
  const parse = () => {
    const m = location.hash.match(/^#\/map\/([\w-]+)/);
    return m ? { page: 'map' as const, id: m[1] } : { page: 'home' as const };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

if (import.meta.env.DEV) Object.assign(window, { __editor: useEditor, __ui: useUi });

export function Root() {
  const route = useRoute();
  const open = (id: string) => { location.hash = `#/map/${id}`; };
  const goHome = () => { location.hash = '#/'; };
  useEffect(() => {
    document.title = route.page === 'home' ? 'Breakdown' : 'Breakdown · editor';
  }, [route]);
  return route.page === 'map' ? <Editor key={route.id} mapId={route.id} goHome={goHome} open={open} /> : <Home open={open} />;
}
