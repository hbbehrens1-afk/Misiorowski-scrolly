# Misiorowski by the Pitch: progress and next steps

Last worked on: 2026-10-21

## How to run it locally

From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/ (the story) or http://localhost:8000/original.html (the original notebook heatmap).
If port 8000 is busy, use 8001. If a change doesn't show up, hard refresh with Cmd+Shift+R.

## What's done

- **Step 1:** `original.html` + `js/original.js` is a faithful port of the Observable notebook. The console logs 3,620 / 3,617 / 2,266, matching the notebook.
- **Step 2 heatmap fixes:** 0.25 ft bins, bins with fewer than 5 pitches hidden, strike flag includes balls in play/bunts, separate whiff rate, equal axis scale, color legend.
- **All 7 story sections** are built in `index.html` (13 scroll steps):
  1. Intro: pitch usage bars
  2. Velocity: ticks per pitch + averages, fastball highlight
  3. Arsenal: movement chart (pfx_x vs pfx_z, in inches)
  4. Location: original vs. fixed heatmap, pitch-type filter + strike/whiff toggle
  5. Count strategy: pitch mix ahead/even/behind, then all 12 counts
  6. Putting hitters away: two-strike whiff rate by Statcast zone, then split by pitch
  7. Closing summary: six headline-number tiles
- Every number on the page is computed from `data/savant_data.csv` at load time (no hardcoded stats).
- Checked at laptop (1280×800) and phone (375×812) sizes with no console errors.

## Files

| File | What it does |
|---|---|
| `index.html` | The story page: text steps + sticky chart |
| `original.html`, `js/original.js` | Original notebook heatmap, kept for comparison |
| `css/style.css` | Layout (chart left / text right; stacked on phones) |
| `js/data.js` | Loads + cleans the CSV, strike/swing/whiff flags, binning |
| `js/charts.js` | One function per chart |
| `js/main.js` | Computes text stats, controls, Scrollama wiring |
| `data/savant_data.csv` | Copy of the Baseball Savant export (read-only) |
| `PLOT_CODE.md` | Every chart's code in story order, with how each is called |
| `OBSERVABLE_CELLS.md` | The same charts as paste-in cells for an Observable notebook |

## Next steps

1. **Publish on GitHub Pages** (browser upload, no command line):
   1. On github.com, click **+ → New repository**, name it (e.g. `misiorowski-scrolly`), set it to **Public**, and click **Create repository**.
   2. Click **uploading an existing file**. Drag in `index.html`, `original.html`, `PLOT_CODE.md`, `OBSERVABLE_CELLS.md`, `NEXT_STEPS.md` and the `css`, `js` and `data` folders. Don't upload the hidden `.claude` folder. Click **Commit changes**.
   3. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder **/ (root)**, then **Save**.
   4. After 1–2 minutes the site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
   5. To update later: in the repo, **Add file → Upload files**, drag in the changed files (same names and folders), and commit.
2. **Optional ideas (not started, not requested yet):**
   - Split section 6 by batter handedness (`stand`) so "catcher's left" can be described as inside/outside.
   - Lower the heatmap minimum from 5 to 3 pitches if the changeup/whiff maps look too sparse.
   - Fix the small overlap of the "Share of pitches →" label and the "100%" tick on the count charts.
3. **Second data source:** the "JM pitch data - data vis.numbers" file turned out to be the same Savant data, not a new dataset. If you meant a different file, add it and keep its charts separate from the Savant ones.
