import type { AttrDef, AttrScope, AttrValue, MapDoc, Node } from './types';

/** Compact nested literal for writing trees by hand (samples, tests, later: paste import). */
export interface NodeSpec {
  t: string;
  /** Attributes keyed by attribute *name*. */
  a?: Record<string, AttrValue>;
  c?: NodeSpec[];
  collapsed?: boolean;
}

export interface BuildOptions {
  /** Attribute definitions in column order; names used in specs but missing here are added as text. */
  attributes?: Array<Pick<AttrDef, 'name'> & Partial<Pick<AttrDef, 'type' | 'options'>> & { scope?: AttrScope }>;
  levelNames?: string[];
  numbering?: boolean;
}

let seq = 0;
const newId = (prefix: string) => `${prefix}${(++seq).toString(36)}`;

export function buildDoc(root: NodeSpec, opts: BuildOptions = {}): MapDoc {
  const attributes: AttrDef[] = [];
  const idByName = new Map<string, string>();
  const ensureAttr = (name: string, type: AttrDef['type'] = 'text', scope?: AttrScope, options?: string[]) => {
    let id = idByName.get(name);
    if (!id) {
      id = newId('a');
      idByName.set(name, id);
      const def: AttrDef = { id, name, type };
      if (scope) def.scope = scope;
      if (options) def.options = options;
      attributes.push(def);
    }
    return id;
  };
  for (const a of opts.attributes ?? []) ensureAttr(a.name, a.type, a.scope, a.options);

  const nodes: Record<string, Node> = {};
  const add = (spec: NodeSpec): string => {
    const id = newId('n');
    const attrs: Record<string, AttrValue> = {};
    for (const [name, value] of Object.entries(spec.a ?? {})) {
      attrs[ensureAttr(name, typeof value === 'number' ? 'number' : 'text')] = value;
    }
    nodes[id] = { id, text: spec.t, children: [], collapsed: !!spec.collapsed, attrs };
    nodes[id].children = (spec.c ?? []).map(add);
    return id;
  };
  const rootId = add(root);

  return {
    id: newId('m'),
    version: 1,
    rootId,
    nodes,
    attributes,
    levelNames: opts.levelNames ?? [],
    settings: { numbering: !!opts.numbering },
    updatedAt: new Date(0).toISOString(),
  };
}
