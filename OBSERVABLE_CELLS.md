# Observable notebook: Misiorowski by the Pitch

Every chart from the site as an Observable notebook, in story order. Each chart has a
text cell explaining its visual encodings (mark, channels, color), then the chart itself.

**How to build the notebook**

1. Open your notebook and attach `savant_data.csv` in the **Files** pane (paperclip icon).
2. Add one cell per code block below, top to bottom, and paste the code in.
   Text cells start with `md`; they render as formatted text.
3. Order doesn't matter to Observable (cells can use cells defined further down), so the
   setup code can live in the Appendix at the bottom while the story reads top to bottom.
4. Plot, d3, `Inputs`, `md`, `html` and `width` are built in; nothing to import.

The chart functions are the same code as the website (`js/charts.js`).


## Title

```js
md`# Misiorowski by the Pitch

A Statcast look at Milwaukee Brewers pitcher Jacob Misiorowski: what he throws, how hard,
how it moves, where it goes, and how he puts hitters away. Data: Baseball Savant pitch-by-pitch export.`
```

## The data

```js
md`## The data

One row per pitch. The table below shows the raw Baseball Savant export; the cleaning cells in the
Appendix add strike, swing and whiff flags (1 or 0) and the count to each row.`
```
```js
Inputs.table(data, {columns: ["game_date", "pitch_name", "release_speed", "pfx_x", "pfx_z", "plate_x", "plate_z", "zone", "balls", "strikes", "description"]})
```
```js
// Row counts: all pitches, pitches with a location, pitches with a type and speed
({all: all.length, located: located.length, typed: typed.length})
```

## 1. Pitch usage

```js
md`## 1. Pitch usage

How often he throws each pitch type.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark | horizontal bar (barX) | one bar per pitch type |
| x position (bar length) | quantitative | number of pitches |
| y position | nominal | pitch type, in fixed order |
| Color (hue) | nominal | pitch type (repeats y so colors match later charts) |
| Text label | quantitative | share of all pitches |

Hover a bar for its count and share.`
```
```js
usageChart(named, {width, height: 360})
```

## 2. Velocity

```js
md`## 2. Velocity by pitch type

Every pitch as a thin tick at its release speed, with a circle at each pitch type's average.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark 1 | tick (tickX), one per pitch | release speed |
| Mark 2 | dot, one per pitch type | average speed |
| x position | quantitative | release speed (mph) |
| y position | nominal | pitch type |
| Color (hue) | nominal | pitch type |
| Opacity | density | low opacity (0.25) so crowded speeds look darker |

The second chart fades the other pitches (opacity 0.05) and adds a dashed 100 mph reference line.
Hover a circle for the average, median and range.`
```
```js
veloChart(typed, {width, height: 420})
```
```js
veloChart(typed, {width, height: 420, highlight: "4-Seam Fastball"})
```

## 3. Movement

```js
md`## 3. Pitch movement

How far spin pushes each pitch sideways and up or down compared with a spinless pitch, in inches.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark 1 | dot, one per pitch | small and faint (r 2.5, opacity 0.3) |
| Mark 2 | dot, one per pitch type | average movement, white fill with colored ring |
| x position | quantitative | horizontal break (pfx_x x 12, catcher's view) |
| y position | quantitative | induced vertical break (pfx_z x 12) |
| Color (hue) | nominal | pitch type |
| Text label | nominal | pitch name next to each average, so color isn't the only cue |
| Aspect ratio | equal scale | one inch is the same length on both axes |

Reference lines at 0 split rise from sink and arm side from glove side.
The second chart highlights the fastball and curveball. Hover a circle for breaks and spin rate.`
```
```js
movementChart(typed, {width, height: 700})
```
```js
movementChart(typed, {width, height: 700, highlight: ["4-Seam Fastball", "Curveball"]})
```

## 4a. Location: the original heatmap

```js
md`## 4a. Location: the original notebook heatmap

The first prototype, kept for comparison: 0.05 ft squares colored by strike rate.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark | rect, one per 0.05 ft square | 2,266 squares |
| x / y position | quantitative, binned | plate location (feet) |
| Color | sequential (Blues), 0 to 1 | strike rate (original strike list) |
| Red outline | reference | fixed strike zone, 1.5 to 3.5 ft |

Problems: most squares hold 1 or 2 pitches so they show 0% or 100%; balls in play don't count as
strikes; a square frame stretches a 4 x 5 ft area; and there is no legend.`
```
```js
originalHeatmap(located, {width, height: 650})
```

## 4b. Location: the fixed heatmap

```js
md`## 4b. Location: the fixed heatmap

Strike rate or whiff rate by location, with every problem from 4a fixed. Use the controls to filter by pitch type
and switch the metric.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark | rect, one per 0.25 ft square | squares with 5+ pitches (or 5+ swings for whiff rate) |
| x / y position | quantitative, binned | plate location (feet, catcher's view) |
| Color | sequential single-hue blue, fixed 0 to 1 | strike rate or whiff rate (whiffs / swings) |
| Red outline | reference | strike zone from the data (average sz_top and sz_bot) |
| Aspect ratio | equal scale | one foot is the same length on both axes |
| Legend | color ramp | 0% to 100% |

Hover a square for both rates and its pitch and swing counts.`
```
```js
viewof pitchChoice = Inputs.select(["All", ...PITCH_NAMES], {label: "Pitch type"})
```
```js
viewof metric = Inputs.radio(new Map([["Strike rate", "strike"], ["Whiff rate", "whiff"]]), {label: "Metric", value: "strike"})
```
```js
locationHeatmap(located, {width, height: 760, metric, pitchName: pitchChoice})
```

## 5. Count strategy

```js
md`## 5. Count strategy

Pitch mix when he is ahead in the count (more strikes than balls), even, or behind, then in all 12 counts.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark | stacked bar (barX + stackX), normalized to 100% | one bar per count group |
| x position (segment length) | quantitative | share of pitches in that group |
| y position | ordinal | Ahead / Even / Behind, or count from 0-0 to 3-2 |
| Color (hue) | nominal | pitch type, stacked in fixed order |
| Text label | quantitative | share, shown on segments of 8% or more |
| Row label | quantitative | number of pitches behind each bar |

Hover a segment for its share and pitch count.`
```
```js
countMixChart(named, {width, height: 300})
```
```js
countMixChart(named, {width, height: 500, groupBy: "count"})
```

## 6. Putting hitters away

```js
md`## 6. Putting hitters away

Whiff rate with two strikes in each Statcast zone: zones 1 to 9 make up the strike zone and zones 11 to 14
are the four areas just outside it.

| Encoding | Channel | Data |
| --- | --- | --- |
| Mark | rect, one per zone | 13 zones, seen from the catcher |
| Position | spatial | zone's place in or around the strike zone |
| Color | sequential single-hue blue, 0 to 1 | whiff rate with two strikes |
| Gray fill | missing-data cue | fewer than 5 swings |
| Text label | quantitative | whiff rate and swing count |
| Facets (fx) | nominal | second chart: one grid each for fastball, slider, curveball |

Hover a zone for its swings, whiffs and location.`
```
```js
zoneWhiffChart(all, {width, height: 640})
```
```js
zoneWhiffChart(all, {width, height: 400, byPitch: true})
```

## 7. Summary

```js
md`## 7. Summary

Six headline numbers, one from each section, all computed from the data (see stats in the Appendix).
These are text tiles rather than a chart: the encoding is the number itself.`
```
```js
summaryTiles(stats)
```

---

# Appendix: setup code

Everything the charts above depend on.
```js
md`---
# Appendix: setup code

The cells below load and clean the data, define shared helpers, and define one function per chart.`
```

### Loading and cleaning the data

```js
// Load the CSV (typed: true = d3.autoType, turns numbers into numbers)
data = FileAttachment("savant_data.csv").csv({typed: true})
```
```js
// The original notebook's strike list (kept so we can show the "before" chart).
ORIGINAL_STRIKE_CALLS = [
  "called_strike", "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip"
]
```
```js
// Fixed strike list: anything that isn't a ball counts as a strike for the pitcher,
// including balls put in play and bunt attempts.
STRIKE_CALLS = [
  ...ORIGINAL_STRIKE_CALLS,
  "hit_into_play", "missed_bunt", "foul_bunt", "automatic_strike"
]
```
```js
// A swing is any pitch the batter offered at.
SWING_CALLS = [
  "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip",
  "foul_bunt", "hit_into_play", "missed_bunt"
]
```
```js
// A whiff is a swing that missed the ball completely.
WHIFF_CALLS = ["swinging_strike", "swinging_strike_blocked", "missed_bunt"]
```
```js
// Each pitch type keeps the same color on every chart.
PITCH_TYPES = [
  { code: "FF", name: "4-Seam Fastball", color: "#2a78d6" },
  { code: "SL", name: "Slider",          color: "#eb6834" },
  { code: "CU", name: "Curveball",       color: "#1baf7a" },
  { code: "FC", name: "Cutter",          color: "#eda100" },
  { code: "CH", name: "Changeup",        color: "#e87ba4" }
]
```
```js
PITCH_NAMES = PITCH_TYPES.map(p => p.name)
```
```js
PITCH_COLORS = PITCH_TYPES.map(p => p.color)
```
```js
// From the pitcher's point of view: more strikes than balls = ahead.
function countState(balls, strikes) {
  if (strikes > balls) return "Ahead";
  if (balls > strikes) return "Behind";
  return "Even";
}
```
```js
COUNT_STATES = ["Ahead", "Even", "Behind"]
```
```js
// All 12 ball-strike counts, in order
COUNTS = d3.range(4).flatMap(b => d3.range(3).map(s => `${b}-${s}`))
```
```js
// Every pitch, with yes/no (1/0) flags and the count added
all = data.map(d => ({
  ...d,
  isStrike: STRIKE_CALLS.includes(d.description) ? 1 : 0,
  isOriginalStrike: ORIGINAL_STRIKE_CALLS.includes(d.description) ? 1 : 0,
  isSwing: SWING_CALLS.includes(d.description) ? 1 : 0,
  isWhiff: WHIFF_CALLS.includes(d.description) ? 1 : 0,
  count: `${d.balls}-${d.strikes}`,
  countState: countState(d.balls, d.strikes)
}))
```
```js
// Pitches that have a plate location (used by the heatmaps)
located = all.filter(d => Number.isFinite(d.plate_x) && Number.isFinite(d.plate_z))
```
```js
// Pitches with a known type and speed (velocity and movement charts)
typed = all.filter(d => PITCH_NAMES.includes(d.pitch_name) && Number.isFinite(d.release_speed))
```
```js
// Pitches with a known type (usage and count charts)
named = all.filter(d => PITCH_NAMES.includes(d.pitch_name))
```
```js
// Groups pitches into square bins of `binSize` feet and computes, per bin:
//   count, strike rate, swings, whiffs, and whiff rate (whiffs ÷ swings).
// `strikeField` lets the "before" chart use the original strike flag.
function binPitches(pitches, binSize, strikeField = "isStrike") {
  const bins = d3.rollup(
    pitches,
    group => ({
      count: group.length,
      strikeRate: d3.mean(group, d => d[strikeField]),
      swings: d3.sum(group, d => d.isSwing),
      whiffs: d3.sum(group, d => d.isWhiff)
    }),
    d => Math.floor(d.plate_x / binSize) * binSize,
    d => Math.floor(d.plate_z / binSize) * binSize
  );

  // Turn the nested Map into a flat list of rectangles.
  return Array.from(bins, ([x, yMap]) =>
    Array.from(yMap, ([y, s]) => ({
      x0: x, x1: x + binSize,
      y0: y, y1: y + binSize,
      ...s,
      whiffRate: s.swings > 0 ? s.whiffs / s.swings : null
    }))
  ).flat();
}
```
```js
// The strike zone: 17-inch plate plus a ball's width on each side (±0.83 ft),
// and the average top/bottom of the zone across the batters he faced.
function strikeZone(pitches) {
  return {
    x0: -0.83, x1: 0.83,
    y0: d3.mean(pitches, d => d.sz_bot),
    y1: d3.mean(pitches, d => d.sz_top)
  };
}
```

### Shared chart helpers

```js
pct = d3.format(".0%")
```
```js
pct1 = d3.format(".1%")
```
```js
mph = d3.format(".1f")
```
```js
inch = d3.format(".1f")
```
```js
// Slightly larger text than Plot's 10px default, for every chart.
plotStyle = ({ fontSize: "12px" })
```
```js
// Shared color scale so every chart paints a pitch type the same way.
pitchColor = ({ domain: PITCH_NAMES, range: PITCH_COLORS })
```
```js
// Width/height that keep 1 ft on the x-axis the same length as 1 ft on the y-axis.
function equalScaleSize(width, height, xFeet, yFeet, margin) {
  let innerW = width - margin.left - margin.right;
  let innerH = innerW * (yFeet / xFeet);
  const maxInnerH = height - margin.top - margin.bottom;
  if (innerH > maxInnerH) {         // too tall: shrink to fit the height instead
    innerH = maxInnerH;
    innerW = innerH * (xFeet / yFeet);
  }
  return {
    width: Math.round(innerW + margin.left + margin.right),
    height: Math.round(innerH + margin.top + margin.bottom)
  };
}
```
```js
// Settings for the fixed heatmap
BIN_SIZE = 0.25   // feet
```
```js
MIN_PITCHES = 5   // hide bins with fewer pitches than this (or swings, for whiff rate)
```
```js
// Statcast zone numbers, drawn on a grid seen from the catcher.
// Zones 1–9 are the strike zone (a 3×3 grid, units 0–3).
// Zones 11–14 are the four L-shaped areas outside it; each is drawn as a big
// quarter square behind the grid, so only the outside "L" part shows.
OUTER_ZONES = ({
  11: { x0: -1, x1: 1.5, y0: 1.5, y1: 4, labelX: -0.5, labelY: 3.5, where: "outside the zone, up and to the catcher's left" },
  12: { x0: 1.5, x1: 4, y0: 1.5, y1: 4, labelX: 3.5, labelY: 3.5, where: "outside the zone, up and to the catcher's right" },
  13: { x0: -1, x1: 1.5, y0: -1, y1: 1.5, labelX: -0.5, labelY: -0.5, where: "outside the zone, down and to the catcher's left" },
  14: { x0: 1.5, x1: 4, y0: -1, y1: 1.5, labelX: 3.5, labelY: -0.5, where: "outside the zone, down and to the catcher's right" }
})
```
```js
function zoneShape(zone) {
  if (OUTER_ZONES[zone]) return OUTER_ZONES[zone];
  const col = (zone - 1) % 3;                // 0 = left, 2 = right
  const row = Math.floor((zone - 1) / 3);    // 0 = top, 2 = bottom
  return {
    x0: col, x1: col + 1, y0: 2 - row, y1: 3 - row,
    labelX: col + 0.5, labelY: 2.5 - row,
    where: `in the zone, ${["top", "middle", "bottom"][row]} ${["left", "center", "right"][col]}`
  };
}
```
```js
ZONES = [11, 12, 13, 14, 1, 2, 3, 4, 5, 6, 7, 8, 9] // outer first so inner draws on top
```

### Chart functions

```js
function usageChart(pitches, { width, height }) {
  // Count pitches of each type, in the fixed pitch order.
  const total = pitches.length;
  const usage = PITCH_NAMES.map(name => {
    const count = pitches.filter(d => d.pitch_name === name).length;
    return { name, count, share: count / total };
  });

  return Plot.plot({
    style: plotStyle,
    width,
    height: Math.min(height, 360),
    marginLeft: 120,
    marginRight: 50,
    x: { label: "Pitches thrown", grid: true },
    y: { label: null, domain: PITCH_NAMES },
    color: pitchColor,
    marks: [
      Plot.barX(usage, {
        x: "count", y: "name", fill: "name", rx2: 4, insetTop: 4, insetBottom: 4,
        channels: { Pitches: "count", Share: d => pct1(d.share) },
        tip: { format: { x: false, fill: false } }
      }),
      // Direct labels: share of all pitches at the end of each bar
      Plot.text(usage, {
        x: "count", y: "name", text: d => pct(d.share),
        dx: 6, textAnchor: "start", fill: "#52514e"
      }),
      Plot.ruleX([0])
    ]
  });
}
```
```js
// `highlight` (optional) is a pitch name to emphasize; the others fade.
function veloChart(pitches, { width, height, highlight = null }) {
  // One summary row per pitch type for the dots and tooltips.
  const summary = PITCH_NAMES.map(name => {
    const speeds = pitches.filter(d => d.pitch_name === name).map(d => d.release_speed);
    return {
      name,
      count: speeds.length,
      mean: d3.mean(speeds),
      median: d3.median(speeds),
      min: d3.min(speeds),
      max: d3.max(speeds)
    };
  });

  const faded = name => highlight && name !== highlight;

  return Plot.plot({
    style: plotStyle,
    width,
    height: Math.min(height, 420),
    marginLeft: 120,
    x: { label: "Release speed (mph)", grid: true, nice: true },
    y: { label: null, domain: PITCH_NAMES },
    color: pitchColor,
    marks: [
      // Every pitch as a thin tick, so you can see the full spread
      Plot.tickX(pitches, {
        x: "release_speed", y: "pitch_name", stroke: "pitch_name",
        strokeOpacity: d => faded(d.pitch_name) ? 0.05 : 0.25
      }),
      // 100 mph reference line, shown when the fastball is highlighted
      highlight ? Plot.ruleX([100], { stroke: "#52514e", strokeDasharray: "4 3" }) : null,
      highlight ? Plot.text([100], { x: d => d, frameAnchor: "top", text: () => "100 mph", dy: -2, fill: "#52514e" }) : null,
      // Average speed for each pitch type (hover for details)
      Plot.dot(summary, {
        x: "mean", y: "name", r: 7, fill: "white", stroke: "name", strokeWidth: 3,
        strokeOpacity: d => faded(d.name) ? 0.3 : 1,
        tip: { format: { x: false, y: false, stroke: false, strokeOpacity: false } },
        channels: {
          Pitch: "name",
          Pitches: "count",
          Average: d => `${mph(d.mean)} mph`,
          Median: d => `${mph(d.median)} mph`,
          Range: d => `${mph(d.min)}–${mph(d.max)} mph`
        }
      })
    ]
  });
}
```
```js
// pfx_x / pfx_z are in feet; we show inches. pfx_z is "induced" vertical break:
// how much the spin makes the ball rise or sink compared with gravity alone.
// `highlight` (optional) is a list of pitch names to emphasize.
function movementChart(pitches, { width, height, highlight = [] }) {
  const moves = pitches
    .filter(d => Number.isFinite(d.pfx_x) && Number.isFinite(d.pfx_z))
    .map(d => ({ name: d.pitch_name, x: d.pfx_x * 12, z: d.pfx_z * 12 }));

  // Average movement and spin for each pitch type (big labeled dots)
  const summary = PITCH_NAMES.map(name => {
    const group = pitches.filter(d => d.pitch_name === name);
    return {
      name,
      count: group.length,
      x: d3.mean(group, d => d.pfx_x * 12),
      z: d3.mean(group, d => d.pfx_z * 12),
      spin: d3.mean(group, d => d.release_spin_rate)
    };
  });

  const faded = name => highlight.length > 0 && !highlight.includes(name);

  // Axis ranges from the data, padded, rounded out to 6-inch steps
  const pad = ([lo, hi]) => [Math.floor((lo - 2) / 6) * 6, Math.ceil((hi + 2) / 6) * 6];
  const xDomain = pad(d3.extent(moves, d => d.x));
  const yDomain = pad(d3.extent(moves, d => d.z));

  // Equal scale: an inch left/right is as long as an inch up/down
  const margin = { top: 25, right: 15, bottom: 40, left: 45 };
  const size = equalScaleSize(width, height - 40, xDomain[1] - xDomain[0], yDomain[1] - yDomain[0], margin);

  // For a right-hander seen from behind the catcher, "arm side" is to the left
  const rightHanded = d3.mode(pitches, d => d.p_throws) === "R";
  const sideLabels = rightHanded ? ["← arm side", "glove side →"] : ["← glove side", "arm side →"];

  return Plot.plot({
    style: plotStyle,
    ...size,
    marginTop: margin.top, marginRight: margin.right,
    marginBottom: margin.bottom, marginLeft: margin.left,
    x: { domain: xDomain, label: "Horizontal break (in, catcher's view)", ticks: d3.range(xDomain[0], xDomain[1] + 1, 6) },
    y: { domain: yDomain, label: "Induced vertical break (in)", ticks: d3.range(yDomain[0], yDomain[1] + 1, 6) },
    color: { ...pitchColor, legend: true },
    marks: [
      Plot.gridX({ stroke: "#e3e2de", strokeOpacity: 1 }),
      Plot.gridY({ stroke: "#e3e2de", strokeOpacity: 1 }),
      Plot.ruleX([0], { stroke: "#a3a29e" }),
      Plot.ruleY([0], { stroke: "#a3a29e" }),
      // Which way is arm side
      Plot.text([sideLabels[0]], { frameAnchor: "bottom-left", dx: 4, dy: -4, fill: "#52514e" }),
      Plot.text([sideLabels[1]], { frameAnchor: "bottom-right", dx: -4, dy: -4, fill: "#52514e" }),
      // Every pitch as a small faint dot
      Plot.dot(moves, {
        x: "x", y: "z", fill: "name", r: 2.5,
        fillOpacity: d => faded(d.name) ? 0.04 : 0.3
      }),
      // Average movement per pitch type (hover for details)
      Plot.dot(summary, {
        x: "x", y: "z", r: 8, fill: "white", stroke: "name", strokeWidth: 3,
        strokeOpacity: d => faded(d.name) ? 0.3 : 1,
        tip: { format: { x: false, y: false, stroke: false, strokeOpacity: false } },
        channels: {
          Pitch: "name",
          Pitches: "count",
          "Horizontal break": d => `${inch(Math.abs(d.x))} in ${(d.x < 0) === rightHanded ? "arm side" : "glove side"}`,
          "Vertical break": d => `${inch(d.z)} in`,
          "Avg spin": d => `${d3.format(",.0f")(d.spin)} rpm`
        }
      }),
      // Direct labels so pitch types aren't told apart by color alone
      Plot.text(summary, {
        x: "x", y: "z", text: "name", dx: 12, textAnchor: "start", fontWeight: 600,
        fill: "#0b0b0b", stroke: "white", strokeWidth: 4, paintOrder: "stroke",
        fillOpacity: d => faded(d.name) ? 0.35 : 1
      })
    ]
  });
}
```
```js
// The original notebook chart (0.05 ft bins, original strike list, 650×650).
function originalHeatmap(pitches, { width, height }) {
  const bins = binPitches(pitches, 0.05, "isOriginalStrike");
  const size = Math.min(650, width, height);

  return Plot.plot({
    style: plotStyle,
    width: size,
    height: size,
    x: { domain: [-2, 2], label: "Horizontal pitch location" },
    y: { domain: [0, 5], label: "Vertical pitch location" },
    color: { label: "Strike rate", scheme: "Blues", domain: [0, 1] },
    marks: [
      Plot.rect(bins, {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1", fill: "strikeRate",
        channels: { "Strike rate": d => pct1(d.strikeRate), Pitches: "count" },
        tip: { format: { x1: false, x2: false, y1: false, y2: false, fill: false } }
      }),
      Plot.rect([{ x0: -0.83, x1: 0.83, y0: 1.5, y1: 3.5 }], {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1",
        fillOpacity: 0, stroke: "red", strokeWidth: 2
      })
    ]
  });
}
```
```js
// The fixed heatmap. metric = "strike" or "whiff"; pitchName = "All" or a pitch name.
function locationHeatmap(pitches, { width, height, metric = "strike", pitchName = "All" }) {
  // 1. Filter by pitch type
  const subset = pitchName === "All" ? pitches : pitches.filter(d => d.pitch_name === pitchName);

  // 2. Bin, then hide bins with too few pitches (or swings) to trust
  const isWhiff = metric === "whiff";
  const bins = binPitches(subset, BIN_SIZE)
    .filter(b => (isWhiff ? b.swings : b.count) >= MIN_PITCHES);

  // 3. Size the chart so the x and y axes use the same feet-per-pixel
  const xDomain = [-2, 2], yDomain = [0, 5];
  const margin = { top: 25, right: 10, bottom: 40, left: 40 };
  const size = equalScaleSize(width, height - 90, 4, 5, margin); // 90px for legend + caption

  const zone = strikeZone(pitches);
  const field = isWhiff ? "whiffRate" : "strikeRate";
  const label = isWhiff ? "Whiff rate (whiffs ÷ swings)" : "Strike rate";

  return Plot.plot({
    style: plotStyle,
    ...size,
    marginTop: margin.top, marginRight: margin.right,
    marginBottom: margin.bottom, marginLeft: margin.left,
    x: { domain: xDomain, label: "Horizontal location (ft, catcher's view)" },
    y: { domain: yDomain, label: "Height (ft)" },
    color: {
      type: "linear", domain: [0, 1], range: ["#cde2fb", "#0d366b"],
      legend: true, label, tickFormat: "%", width: Math.min(260, size.width)
    },
    caption: `${d3.format(",")(subset.length)} pitches · ${BIN_SIZE} ft bins · hidden if under ${MIN_PITCHES} ${isWhiff ? "swings" : "pitches"}`,
    marks: [
      Plot.rect(bins, {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1", fill: field,
        inset: 0.5,
        tip: { format: { x1: false, x2: false, y1: false, y2: false, fill: false } },
        channels: {
          Pitches: "count",
          "Strike rate": d => pct1(d.strikeRate),
          Swings: "swings",
          "Whiff rate": d => d.whiffRate === null ? "–" : pct1(d.whiffRate)
        }
      }),
      // Strike zone outline (average zone top/bottom from the data)
      Plot.rect([zone], {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1",
        fillOpacity: 0, stroke: "#e34948", strokeWidth: 2
      })
    ]
  });
}
```
```js
// 100% stacked bars: one bar per group, split into pitch-type shares.
// groupBy = "countState" (Ahead/Even/Behind) or "count" (all 12 counts).
function countMixChart(pitches, { width, height, groupBy = "countState" }) {
  const groups = groupBy === "count" ? COUNTS : COUNT_STATES;

  // Share of each pitch type within each group
  const rows = groups.flatMap(group => {
    const inGroup = pitches.filter(d => d[groupBy] === group);
    return PITCH_NAMES.map(name => {
      const count = inGroup.filter(d => d.pitch_name === name).length;
      return { group, name, count, total: inGroup.length, share: count / inGroup.length };
    });
  });

  // Row labels include how many pitches are behind each bar
  const totals = new Map(rows.map(d => [d.group, d.total]));
  const rowLabel = g => `${g} (${d3.format(",")(totals.get(g))})`;

  const rowHeight = groupBy === "count" ? 30 : 64;

  return Plot.plot({
    style: plotStyle,
    width,
    height: Math.min(height - 40, groups.length * rowHeight + 50),
    marginLeft: 110,
    x: { label: "Share of pitches", tickFormat: "%", domain: [0, 1] },
    y: { label: groupBy === "count" ? "Count (balls-strikes)" : null, domain: groups, tickFormat: rowLabel },
    color: { ...pitchColor, legend: true },
    marks: [
      Plot.barX(rows, Plot.stackX({
        x: "share", y: "group", fill: "name", z: "name", order: PITCH_NAMES,
        insetLeft: 1, insetRight: 1,     // thin gaps between segments
        tip: { format: { x: false, y: false, fill: false, z: false } },
        channels: {
          Pitch: "name",
          [groupBy === "count" ? "Count" : "Situation"]: d => d.group,
          Share: d => pct1(d.share),
          Pitches: d => `${d.count} of ${d.total}`
        }
      })),
      // Percent labels inside segments that are wide enough to hold them
      Plot.text(rows, Plot.stackX({
        x: "share", y: "group", z: "name", order: PITCH_NAMES,
        text: d => d.share >= 0.08 ? pct(d.share) : "",
        fill: "#0b0b0b"
      }))
    ]
  });
}
```
```js
// Whiff rate per zone with two strikes. With byPitch = true, one small grid per
// main pitch type (fastball, slider, curveball).
function zoneWhiffChart(pitches, { width, height, byPitch = false }) {
  const twoStrike = pitches.filter(d => d.strikes === 2 && Number.isFinite(d.zone));
  const groups = byPitch ? ["4-Seam Fastball", "Slider", "Curveball"] : ["All pitches"];

  const rows = groups.flatMap(group => {
    const inGroup = byPitch ? twoStrike.filter(d => d.pitch_name === group) : twoStrike;
    return ZONES.map(zone => {
      const inZone = inGroup.filter(d => d.zone === zone);
      const swings = d3.sum(inZone, d => d.isSwing);
      const whiffs = d3.sum(inZone, d => d.isWhiff);
      return { group, zone, ...zoneShape(zone), swings, whiffs, whiffRate: swings > 0 ? whiffs / swings : null };
    });
  });
  const enough = d => d.swings >= MIN_PITCHES;   // same 5-swing minimum as the heatmap

  // Size: square grids (5×5 units each), side by side when split by pitch
  const facetGap = byPitch ? 12 : 0;
  const side = Math.max(80, Math.min(
    (width - facetGap * (groups.length - 1)) / groups.length,
    height - 80 - (byPitch ? 24 : 0)
  ));

  return Plot.plot({
    style: plotStyle,
    width: Math.round(side * groups.length + facetGap * (groups.length - 1)),
    height: Math.round(side + (byPitch ? 24 : 0)),
    margin: 0,
    marginTop: byPitch ? 24 : 0,
    x: { domain: [-1, 4], axis: null },
    y: { domain: [-1, 4], axis: null },
    fx: { domain: groups, label: null, axis: byPitch ? "top" : null, padding: facetGap / side },
    caption: side < 140 ? "Tap a square for its numbers." : null,
    color: {
      type: "linear", domain: [0, 1], range: ["#cde2fb", "#0d366b"],
      legend: true, label: "Whiff rate with two strikes", tickFormat: "%", width: Math.min(260, width)
    },
    marks: [
      // Zones with enough swings, colored by whiff rate
      Plot.rect(rows.filter(enough), {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1", fx: "group",
        fill: "whiffRate", stroke: "white", strokeWidth: 2,
        channels: { Pitch: "group", Zone: "zone", Where: "where", Swings: "swings", Whiffs: "whiffs", "Whiff rate": d => pct1(d.whiffRate) },
        tip: { lineWidth: 34, format: { x1: false, x2: false, y1: false, y2: false, fill: false, fx: false } }
      }),
      // Zones with too few swings, in gray
      Plot.rect(rows.filter(d => !enough(d)), {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1", fx: "group",
        fill: "#efeeeb", stroke: "white", strokeWidth: 2,
        channels: { Pitch: "group", Zone: "zone", Where: "where", Swings: "swings" },
        tip: { lineWidth: 34, format: { x1: false, x2: false, y1: false, y2: false, fx: false } }
      }),
      // Strike zone outline
      Plot.rect([{ x0: 0, x1: 3, y0: 0, y1: 3 }], {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1", fill: "none", stroke: "#0b0b0b", strokeWidth: 1.5
      }),
      // Labels: whiff rate (and swing count when there's room).
      // Grids too small for labels (phones) rely on the tooltips instead.
      side < 140 ? null : Plot.text(rows, {
        x: "labelX", y: "labelY", fx: "group",
        text: d => !enough(d) ? (side > 200 ? `${d.swings} sw` : "")
          : side > 200 ? `${pct(d.whiffRate)}\n${d.swings} sw` : pct(d.whiffRate),
        fill: d => enough(d) && d.whiffRate > 0.45 ? "white" : "#0b0b0b",
        fontSize: side > 200 ? 12 : 10,
        lineHeight: 1.2
      })
    ]
  });
}
```
```js
// Not a chart: a grid of headline numbers, one from each section.
// `stats` is the object computed in main.js; every value comes from the CSV.
function summaryTiles(stats) {
  const tiles = [
    { value: `${stats.ffMean} mph`, label: "Average fastball", note: `${stats.ff100} of fastballs hit 100+ mph` },
    { value: stats.ffShare, label: "Fastball usage", note: `${stats.ffBehind} when behind in the count` },
    { value: `${stats.ffCuGap} in`, label: "Fastball vs. curveball vertical break", note: `${stats.ffIVB} in of rise vs. ${stats.cuIVB} in of drop` },
    { value: stats.ts2Out, label: "Two-strike whiff rate outside the zone", note: `vs. ${stats.ts2In} inside it` },
    { value: stats.cuBestRate, label: "Curveball whiffs in its best two-strike spot", note: `${stats.cuBestSwings} swings, ${stats.cuBestWhere}` },
    { value: stats.whiffRate, label: "Overall whiff rate", note: `on all swings, ${stats.pitches} pitches total` }
  ];

  const grid = document.createElement("div");
  grid.className = "tiles";
  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.title = `${t.label}: ${t.value} (${t.note})`;   // hover text
    // textContent (not innerHTML) so data values are never treated as HTML
    for (const [cls, text] of [["tile-value", t.value], ["tile-label", t.label], ["tile-note", t.note]]) {
      const el = document.createElement("div");
      el.className = cls;
      el.textContent = text;
      tile.append(el);
    }
    grid.append(tile);
  }
  return grid;
}
```

### Story numbers and tile styles

```js
// Team abbreviations we need to spell out in the text
TEAM_NAMES = ({ MIL: "Milwaukee Brewers" })
```
```js
function computeStats({ all, located, typed }) {
  const fastballs = typed.filter(d => d.pitch_name === "4-Seam Fastball").map(d => d.release_speed);

  // Average speed per pitch type, to find the slowest one
  const veloByType = PITCH_NAMES.map(name => ({
    name,
    mean: d3.mean(typed.filter(d => d.pitch_name === name), d => d.release_speed)
  }));
  const slowest = d3.least(veloByType, d => d.mean);

  // The team he pitched for: the home team when he pitches the top of an inning
  const teams = new Set(all.map(d => d.inning_topbot === "Top" ? d.home_team : d.away_team));
  const team = [...teams].map(t => TEAM_NAMES[t] ?? t).join(" / ");

  // Original notebook bins: how many hold only 1–2 pitches?
  const origBins = binPitches(located, 0.05, "isOriginalStrike");

  // Statcast zones 1–9 are inside the strike zone; 11–14 are outside
  const inZone = located.filter(d => d.zone >= 1 && d.zone <= 9);
  const outZone = located.filter(d => d.zone >= 11);

  // Average movement in inches (pfx values are in feet)
  const avgMove = (name, field) => d3.mean(typed.filter(d => d.pitch_name === name), d => d[field] * 12);
  const ffIVB = avgMove("4-Seam Fastball", "pfx_z");
  const cuIVB = avgMove("Curveball", "pfx_z");

  const dates = d3.extent(all, d => d.game_date);
  const fmtDate = d3.utcFormat("%B %-d, %Y");
  const named = all.filter(d => PITCH_NAMES.includes(d.pitch_name));

  // Share of a pitch type among pitches that match a filter
  const shareOf = (name, filter) => {
    const group = named.filter(filter);
    return group.filter(d => d.pitch_name === name).length / group.length;
  };

  // Two-strike swings and whiffs, overall and in/out of the zone
  const twoStrike = all.filter(d => d.strikes === 2 && Number.isFinite(d.zone));
  const whiffRate = group => d3.sum(group, d => d.isWhiff) / d3.sum(group, d => d.isSwing);

  // A pitch's best two-strike zone: highest whiff rate among zones with 20+ swings
  const bestZone = name => {
    const byZone = d3.rollups(
      twoStrike.filter(d => d.pitch_name === name),
      g => ({ swings: d3.sum(g, d => d.isSwing), rate: whiffRate(g) }),
      d => d.zone
    ).filter(([, z]) => z.swings >= 20);
    const [zone, best] = d3.greatest(byZone, ([, z]) => z.rate);
    return { where: zoneShape(zone).where, rate: pct(best.rate), swings: best.swings };
  };
  const ffBest = bestZone("4-Seam Fastball");
  const cuBest = bestZone("Curveball");

  return {
    ts2Swings: d3.format(",")(d3.sum(twoStrike, d => d.isSwing)),
    ts2Whiff: pct(whiffRate(twoStrike)),
    ts2In: pct(whiffRate(twoStrike.filter(d => d.zone <= 9))),
    ts2Out: pct(whiffRate(twoStrike.filter(d => d.zone >= 11))),
    ffBestWhere: ffBest.where, ffBestRate: ffBest.rate, ffBestSwings: ffBest.swings,
    cuBestWhere: cuBest.where, cuBestRate: cuBest.rate, cuBestSwings: cuBest.swings,
    ffAhead: pct(shareOf("4-Seam Fastball", d => d.countState === "Ahead")),
    ffBehind: pct(shareOf("4-Seam Fastball", d => d.countState === "Behind")),
    cuAhead: pct(shareOf("Curveball", d => d.countState === "Ahead")),
    cuBehind: pct(shareOf("Curveball", d => d.countState === "Behind")),
    ff30: pct(shareOf("4-Seam Fastball", d => d.count === "3-0")),
    n30: named.filter(d => d.count === "3-0").length,
    pitches: d3.format(",")(all.length),
    games: new Set(all.map(d => d.game_pk)).size,
    dateRange: `${fmtDate(dates[0])} to ${fmtDate(dates[1])}`,
    seasons: [...new Set(all.map(d => d.game_year))].sort().join(" and "),
    throws: { R: "right", L: "left" }[d3.mode(all, d => d.p_throws)],
    team,
    ffShare: pct(named.filter(d => d.pitch_name === "4-Seam Fastball").length / named.length),
    ffMean: mph(d3.mean(fastballs)),
    ffMax: mph(d3.max(fastballs)),
    ff100: pct(fastballs.filter(s => s >= 100).length / fastballs.length),
    slowestName: slowest.name.toLowerCase(),
    slowestMean: mph(slowest.mean),
    veloGap: mph(d3.max(veloByType, d => d.mean) - slowest.mean),
    chArm: inch(Math.abs(avgMove("Changeup", "pfx_x"))),
    ffIVB: inch(ffIVB),
    cuIVB: inch(Math.abs(cuIVB)),
    ffCuGap: d3.format(".0f")(ffIVB - cuIVB),
    origBins: d3.format(",")(origBins.length),
    origSmall: pct(origBins.filter(b => b.count <= 2).length / origBins.length),
    origExtreme: pct(origBins.filter(b => b.strikeRate === 0 || b.strikeRate === 1).length / origBins.length),
    binSize: BIN_SIZE,
    minPitches: MIN_PITCHES,
    inZoneStrike: pct(d3.mean(inZone, d => d.isStrike)),
    outZoneStrike: pct(d3.mean(outZone, d => d.isStrike)),
    whiffRate: pct(d3.sum(all, d => d.isWhiff) / d3.sum(all, d => d.isSwing))
  };
}
```
```js
stats = computeStats({all, located, typed})
```
```js
// Tile styles (copied from css/style.css)
html`<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .tile { background: #fff; border: 1px solid #e3e2de; border-radius: 8px; padding: 14px 16px; }
  .tile-value { font-size: 2rem; font-weight: 700; color: #12284b; line-height: 1.1; }
  .tile-label { font-weight: 600; margin-top: 4px; }
  .tile-note { color: #52514e; font-size: 0.85rem; margin-top: 2px; }
</style>`
```
