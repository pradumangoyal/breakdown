export type AttrValue = string | number;

export interface AttrDef {
  id: string;
  name: string;
  type: 'text' | 'number';
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
