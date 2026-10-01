import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../src/model/store';
import { buildDoc } from '../src/model/build';

const s = () => useEditor.getState();
const texts = () => Object.values(s().doc.nodes).map((n) => n.text).sort();
const idOf = (t: string) => Object.values(s().doc.nodes).find((n) => n.text === t)!.id;

beforeEach(() => s().load(buildDoc({ t: 'R', c: [{ t: 'A' }, { t: 'B' }] })));

describe('editor store', () => {
  it('creating a node and typing its first text is one undo step', () => {
    const id = s().addSibling(idOf('A'));
    s().setText(id, 'N');
    s().setText(id, 'New'); // later keystrokes coalesce too
    expect(texts()).toEqual(['A', 'B', 'New', 'R']);
    s().undo();
    expect(texts()).toEqual(['A', 'B', 'R']); // no empty node left behind
  });

  it('discarding an untouched new node leaves no undo step behind', () => {
    const before = s().past.length;
    const id = s().addChild(idOf('B'));
    s().discardNew(id);
    expect(texts()).toEqual(['A', 'B', 'R']);
    expect(s().past.length).toBe(before);
    expect(s().selectedId).toBe(idOf('B')); // back to where you were
  });

  it('does not discard a node that has text, and keeps a selection made elsewhere', () => {
    const id = s().addChild(idOf('B'));
    s().setText(id, 'keep me');
    s().discardNew(id);
    expect(texts()).toContain('keep me');
    const empty = s().addChild(idOf('A'));
    s().select(idOf('B'));
    s().discardNew(empty);
    expect(s().selectedId).toBe(idOf('B'));
  });

  it('allows nothing to be selected', () => {
    s().select('');
    expect(s().selectedId).toBe('');
    s().addChild(idOf('A'));
    s().select('');
    s().undo();
    expect(s().doc.nodes[s().selectedId]).toBeDefined(); // falls back to a real node
  });
});
