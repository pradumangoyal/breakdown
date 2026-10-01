# Breakdown

Break anything down into a tree (a problem, an issue tree, a work breakdown, a plan) and export it to a spreadsheet where every parent cell is merged across its children.

**Use it:** https://pradumangoyal.github.io/breakdown/

Your maps are saved **only in your browser** (localStorage). Nothing is uploaded. Use **Export** to back a map up or move it to another browser, and **Import** to bring it back.

## What it does

- **Map + outline, always in sync.** Think on a left-to-right mind map, or type fast in an indented outline (toggle with `O`). Both edit the same tree.
- **Keyboard first.** On the map: `Enter` adds a sibling, `Tab` a child, `⇧Enter` edits, arrows move (↓/↑ go to the next logical node, across branches). Drag nodes to move them. Press `?` for all keys.
- **Your own attributes.** Add fields like Owner, Status or Notes, and decide where each applies: all nodes, end nodes only, specific levels, or one branch. Fill them in the side panel or the spreadsheet-style **Table** view.
- **Export to a Sheet.** The **Sheet** view shows exactly what you'll get. Download it as `.xlsx` and open it in Google Sheets or Excel: one row per end node, parent cells merged down, attribute columns placed beside their level, grey cells where an attribute doesn't apply.
- **My maps.** Create, open, rename, duplicate, export, import and delete maps. Everything autosaves.
- **Focus mode** (`F`) hides everything but the map.

## Sheet layout rules

- The central node becomes the Sheet name and a title row. Its attributes go on a line under the title.
- Each end node is one row; a node with children is merged down across its rows.
- An end node shallower than the deepest branch is merged across to the last level column.
- Attributes of nodes with children get a column right after their level (`Level 2 · Owner`), merged down with the node; attributes of end nodes go after the last level.
- Attributes scoped to end nodes or levels always get their column (so the Sheet is ready to fill in); cells outside an attribute's scope are grey.
- Text is written literally: `=SUM(…)` or `+91…` never turns into a formula.

The rules live in `src/export/grid.ts` and are covered by tests in `tests/`.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests (layout rules, tree operations, scopes, storage, navigation)
npm run build   # production build into dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

### Layout of the code

```
src/
  app/        My maps screen, editor shell, tiny hash router
  model/      tree data model, operations, undo/redo store, attribute scopes
  views/      map, outline, table, attribute panel, Sheet preview, status bar
  export/     tree → grid layout, .xlsx and Google Sheets payloads
  storage/    map library in localStorage
poc/          the experiments this started from (Sheet layout, Google Sheets export)
docs/         notes: why the map is custom-built, Google export setup
```

## Roadmap

- One-click export straight into a new Google Sheet (works in `poc/02-google-export/`; needs a Google Cloud OAuth client, see `docs/google-export-setup.md`).
- Optional sync across devices.

## License

MIT
