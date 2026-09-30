# Mind map → Google Sheets

Break any topic down into a tree (a problem, an issue tree, a work breakdown), attach your own attributes, and export it to a Google Sheet where each parent cell is merged down across its children.

Status: **POC stage**. POC-A (layout) is signed off; POC-B needs Google Cloud setup (`poc/02-google-export/SETUP.md`); POC-C (editor) is ready to try.

```bash
npm install
npm test            # tree → grid layout rules + Sheets payload
npm run dev         # then open one of:
                    #   /poc/03-editor/        synced outline + map editor (POC-C)
                    #   /poc/01-sheet-layout/  tree → Sheet layout samples (POC-A)
                    #   /poc/02-google-export/ one-click Google Sheets export (POC-B)
npm run poc:xlsx    # writes sample .xlsx files to poc/01-sheet-layout/out/
```

## Layout rules (`src/export/grid.ts`)

- The central node becomes the Sheet name and a title row. Its attributes go on a line under the title.
- Each end node becomes one row. A node with children is merged down across its rows.
- An end node shallower than the deepest branch is merged across to the last level column.
- Attributes of a node with children get a column right after its level (`Level 2 · Owner`), merged down with it.
- Attributes of end nodes go in columns after the last level.
- Text is always written literally. `=SUM(…)` or `+91…` never becomes a formula.
