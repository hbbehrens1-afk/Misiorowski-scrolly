// charts.js — one function per chart. Each takes the data plus the space
// available ({ width, height }) and returns a Plot element to put on the page.

const pct = d3.format(".0%");
const pct1 = d3.format(".1%");
const mph = d3.format(".1f");
const inch = d3.format(".1f");

// Slightly larger text than Plot's 10px default, for every chart.
const plotStyle = { fontSize: "12px" };

// Shared color scale so every chart paints a pitch type the same way.
const pitchColor = { domain: PITCH_NAMES, range: PITCH_COLORS };

// ---------- Section 1: pitch usage ----------

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

// ---------- Section 2: velocity by pitch type ----------

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

// ---------- Section 3: movement (arsenal) ----------

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

// ---------- Section 5: pitch mix by count ----------

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

// ---------- Section 6: two-strike whiff rate by zone ----------

// Statcast zone numbers, drawn on a grid seen from the catcher.
// Zones 1–9 are the strike zone (a 3×3 grid, units 0–3).
// Zones 11–14 are the four L-shaped areas outside it; each is drawn as a big
// quarter square behind the grid, so only the outside "L" part shows.
const OUTER_ZONES = {
  11: { x0: -1, x1: 1.5, y0: 1.5, y1: 4, labelX: -0.5, labelY: 3.5, where: "outside the zone, up and to the catcher's left" },
  12: { x0: 1.5, x1: 4, y0: 1.5, y1: 4, labelX: 3.5, labelY: 3.5, where: "outside the zone, up and to the catcher's right" },
  13: { x0: -1, x1: 1.5, y0: -1, y1: 1.5, labelX: -0.5, labelY: -0.5, where: "outside the zone, down and to the catcher's left" },
  14: { x0: 1.5, x1: 4, y0: -1, y1: 1.5, labelX: 3.5, labelY: -0.5, where: "outside the zone, down and to the catcher's right" }
};

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
const ZONES = [11, 12, 13, 14, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // outer first so inner draws on top

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

// ---------- Section 4: location heatmaps ----------

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

// Settings for the fixed heatmap
const BIN_SIZE = 0.25;   // feet
const MIN_PITCHES = 5;   // hide bins with fewer pitches than this (or swings, for whiff rate)

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

// ---------- Section 7: closing summary ----------

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
