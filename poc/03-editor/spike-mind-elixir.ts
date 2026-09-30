import MindElixir from 'mind-elixir';
import 'mind-elixir/style.css';
import type { MindElixirData, NodeObj } from 'mind-elixir';
import { treeToGrid } from '../../src/export/grid';
import { gridToHtml } from '../../src/export/html';
import type { MapDoc, Node } from '../../src/model/types';
import { problemTree } from '../01-sheet-layout/samples';

// Our model → mind-elixir. Attributes shown as tags ("Owner: Riya").
function toElixir(doc: MapDoc): MindElixirData {
  const names = new Map(doc.attributes.map((a) => [a.id, a.name]));
  const conv = (id: string): NodeObj => {
    const n = doc.nodes[id];
    return {
      id,
      topic: n.text,
      expanded: !n.collapsed,
      tags: Object.entries(n.attrs).map(([k, v]) => `${names.get(k) ?? k}: ${v}`),
      metadata: { attrs: n.attrs },
      children: n.children.map(conv),
    };
  };
  return { nodeData: conv(doc.rootId) };
}

// mind-elixir → our model. Tags are display-only; attributes ride along in metadata.
function fromElixir(data: MindElixirData, base: MapDoc): MapDoc {
  const nodes: Record<string, Node> = {};
  const conv = (o: NodeObj): string => {
    nodes[o.id] = {
      id: o.id,
      text: o.topic,
      collapsed: o.expanded === false,
      attrs: (o.metadata as { attrs?: Node['attrs'] } | undefined)?.attrs ?? {},
      children: (o.children ?? []).map(conv),
    };
    return o.id;
  };
  const rootId = conv(data.nodeData);
  return { ...base, rootId, nodes };
}

const base = problemTree();
const log = document.getElementById('log')!;
const sheet = document.getElementById('sheet')!;

const mind = new MindElixir({
  el: '#map',
  direction: MindElixir.RIGHT,
  editable: true,
  contextMenu: true,
  toolBar: true,
  keypress: true,
  allowUndo: true,
});
mind.init(toElixir(base));
(window as any).__mind = mind; // for poking at refresh/selection behaviour from devtools

const render = () => {
  const t = performance.now();
  const doc = fromElixir(mind.getData(), base);
  sheet.innerHTML = gridToHtml(treeToGrid(doc));
  return (performance.now() - t).toFixed(1);
};
render();

mind.bus.addListener('operation', (op: { name: string }) => {
  const ms = render();
  log.textContent = `${op.name}  → sheet rebuilt in ${ms} ms\n` + log.textContent;
});
