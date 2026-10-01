# Spike: mind-elixir vs a custom map (2026-09-30)

Page: `/poc/03-editor/spike-mind-elixir.html` (mind-elixir 6.0.0-next.4, the current `latest` tag on npm).

## What worked
- Looks polished out of the box: right-hand layout, pan/zoom, collapse, context menu, undo, drag-to-move.
- Keyboard flow is good: Tab (child) → type → Enter → Enter (sibling) → type.
- Attributes can be shown as `tags` ("Owner: Riya"). Our attribute values travel in `metadata`.
- Map → our model sync is cheap: `getData()` + convert on every `operation` event, and the Sheet preview rebuilds in 0.2 ms.
- `refresh(data)` keeps the pan and zoom. It drops the selection, which `selectNode(findEle(id))` restores.

## What rules it out
With a synced outline, **our store has to push every change into the map**. mind-elixir only accepts a whole new tree through `refresh()`, and the cost grows much faster than the tree:

| Nodes | `refresh()` |
|---|---|
| 50 | 4 ms |
| 150 | 19 ms |
| 400 | 107 ms |
| 1,000 | ~900 ms |

The alternatives are worse:
- Mirroring each operation through its incremental API (`addChild`, `moveNodesIn`, …) means keeping two trees in step by hand.
- Only ever releasing prerelease builds (`6.0.0-next.*`) is a maintenance risk.

## Decision
Build the map ourselves on the shared store. React re-renders only the nodes that changed (immer keeps untouched node objects identical), and the layout is one O(n) pass. That's the same "one row per end node, parent centred on its children" logic the Sheet export already uses.
