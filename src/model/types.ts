export type AttrValue = string | number;

/**
 * Where an attribute applies. Two independent parts:
 *  - which nodes: all, end nodes only (no children), or specific levels (0 = central node)
 *  - where: the whole map, or only a branch (that node and everything under it)
 */
export interface AttrScope {
  nodes: 'all' | 'end' | 'levels';
  levels?: number[];
  within?: string | null;
}

export interface AttrDef {
  id: string;
  name: string;
  /** 'select' = dropdown: values are picked from `options`. */
  type: 'text' | 'number' | 'select';
  /** Dropdown choices, in order (only for type 'select'). Values not in the list are kept, just flagged. */
  options?: string[];
  /** Missing = applies to all nodes in the whole map. */
  scope?: AttrScope;
}

export interface Node {
  id: string;
  text: string;
  children: string[];
  /** View-only: export always includes collapsed subtrees. */
  collapsed: boolean;
  attrs: Record<string, AttrValue>;
}

export interface MapDoc {
  id: string;
  version: 1;
  rootId: string;
  nodes: Record<string, Node>;
  /** Ordered: this order is the column order in the export. */
  attributes: AttrDef[];
  /** Optional custom header per level (index 0 = Level 1). */
  levelNames: string[];
  settings: {
    /** Prefix node text with 1 / 1.2 / 1.2.1 in the export. */
    numbering: boolean;
  };
  updatedAt: string;
}
