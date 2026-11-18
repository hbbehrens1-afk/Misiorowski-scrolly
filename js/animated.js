// animated.js — the animated version of the story (index.html).
// One SVG stays on screen the whole time. Every pitch is a dot that keeps its
// pitch-type color, and each scroll step moves the dots (and fades bars and cells
// in and out) with d3 transitions, instead of drawing a brand-new chart.
// Uses helpers from data.js (loading, binning) and charts.js (formats, zone shapes, tiles).

const DURATION = 900;                                    // ms for each step's animation
const color = d3.scaleOrdinal(PITCH_NAMES, PITCH_COLORS); // same pitch colors as the original
const seqColor = d3.scaleLinear([0, 1], ["#cde2fb", "#0d366b"]).interpolate(d3.interpolateLab);
const TEAM_NAMES = { MIL: "Milwaukee Brewers" };

// Ball-strike counts in the order an at-bat moves through them:
// 0-0, then 0-1 / 1-0, then 0-2 / 1-1 / 2-0, and so on
const COUNT_ORDER = d3.sort(COUNTS, c => +c[0] + +c[2], c => +c[0]);

// ---------- Page elements ----------
const figure = document.querySelector("#figure");
const vizEl = document.querySelector("#viz");
const tipEl = document.querySelector("#tip");
const legendEl = document.querySelector("#legend");
const controlsEl = document.querySelector("#controls");
const metricToggle = document.querySelector("#metric-toggle");
const pitchFilter = document.querySelector("#pitch-filter");
const seqLegend = document.querySelector("#seq-legend");
const tilesEl = document.querySelector("#tiles");

// What is on screen right now
const state = { step: "usage", metric: "strike", pitchName: "All" };

let data, pitches, stats, typeCounts, typeStats, rightHanded, dots;
const order = {};              // pitch types sorted for each chart
let W, H, m, iw, ih, narrow;   // chart size and margins
let instant = false;           // true = jump to the layout without animating (resize)

// ---------- SVG layers (bottom to top) ----------
const svg = d3.select(vizEl).append("svg");
const gRoot = svg.append("g");
const gAxisX = gRoot.append("g").attr("class", "axis axis-x").attr("opacity", 0);
const gAxisY = gRoot.append("g").attr("class", "axis axis-y").attr("opacity", 0);
const gMarks = gRoot.append("g");                                   // bars and heatmap cells
const clip = svg.append("clipPath").attr("id", "plot-clip").append("rect");
const gDots = gRoot.append("g").attr("clip-path", "url(#plot-clip)"); // one circle per pitch
                                                                      // (clipped: wild pitches stay inside the chart)
const overlay = gRoot.append("rect").attr("class", "overlay");      // catches hover over dots
const gAnno = gRoot.append("g");                                    // labels, lines, averages
const ring = gRoot.append("circle").attr("class", "hover-ring").attr("opacity", 0);

// Repeatable "random" number in [0, 1) for pitch i, so the jitter is the same on every redraw
function rand(i, salt) {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- Sizing ----------

function measure() {
  W = vizEl.clientWidth;
  H = vizEl.clientHeight;
  narrow = window.matchMedia("(max-width: 800px)").matches;
  m = narrow ? { top: 22, right: 12, bottom: 40, left: 98 } : { top: 28, right: 24, bottom: 48, left: 128 };
  iw = Math.max(50, W - m.left - m.right);
  ih = Math.max(50, H - m.top - m.bottom);
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  gRoot.attr("transform", `translate(${m.left},${m.top})`);
  overlay.attr("width", iw).attr("height", ih);
  clip.attr("x", -4).attr("y", -4).attr("width", iw + 8).attr("height", ih + 8);
}

// x/y scales where one unit is the same number of pixels on both axes, centered in the chart
function equalScales([x0, x1], [y0, y1]) {
  const k = Math.min(iw / (x1 - x0), ih / (y1 - y0));
  const ox = (iw - (x1 - x0) * k) / 2, oy = (ih - (y1 - y0) * k) / 2;
  return {
    x: d3.scaleLinear([x0, x1], [ox, ox + (x1 - x0) * k]),
    y: d3.scaleLinear([y0, y1], [oy + (y1 - y0) * k, oy])
  };
}

// ---------- Drawing helpers shared by every step ----------

// Move every dot to its target (d.tx, d.ty, d.tr, d.to). If a step sets d.after,
// the dot fades to that opacity once it arrives (used when dots turn into bars).
function moveDots(t) {
  if (instant) for (const d of pitches) if (d.after != null) d.to = d.after;
  const tr = dots.transition(t)
    .delay(d => instant ? 0 : d.j3 * 200)          // small stagger looks more natural
    .attr("cx", d => d.tx).attr("cy", d => d.ty)
    .attr("r", d => d.tr).attr("fill-opacity", d => d.to);
  if (!instant && pitches.some(d => d.after != null)) {
    tr.transition().delay(150).duration(500).attr("fill-opacity", d => d.after ?? d.to);
  }
}

// Axes fade in when a step gives them a scale and fade out when it doesn't
function drawAxes(t, { x = null, y = null, xAt = ih, yAt = 0, xFormat = null } = {}) {
  if (x) {
    gAxisX.transition(t).attr("opacity", 1).attr("transform", `translate(0,${xAt})`)
      .call(d3.axisBottom(x).ticks(narrow ? 4 : 7, xFormat));
  } else gAxisX.transition(t).attr("opacity", 0);
  if (y) {
    gAxisY.transition(t).attr("opacity", 1).attr("transform", `translate(${yAt},0)`)
      .call(d3.axisLeft(y).ticks(narrow ? 5 : 7));
  } else gAxisY.transition(t).attr("opacity", 0);
}

// Bars and heatmap cells. Each item has an id, so a cell that exists before and after
// a change (e.g. a new pitch-type filter) changes color in place instead of blinking.
function drawMarks(items, t) {
  gMarks.selectAll("rect.mark")
    .data(items, d => d.id)
    .join(
      enter => enter.append("rect")
        .attr("x", d => d.fromX ?? d.x).attr("y", d => d.y)
        .attr("width", d => d.fromW ?? d.w).attr("height", d => d.h)
        .attr("fill", d => d.fill).attr("opacity", 0),
      update => update,
      exit => exit.transition(t).attr("opacity", 0).remove()
    )
    .attr("class", d => `mark${d.type ? " pitch" : ""}`)
    .attr("stroke", d => d.stroke ?? null)
    .attr("stroke-width", d => d.strokeWidth ?? null)
    .order()
    .call(sel => sel.transition(t).delay(d => instant ? 0 : (d.delay ?? 0))
      .attr("x", d => d.x).attr("y", d => d.y)
      .attr("width", d => d.w).attr("height", d => d.h)
      .attr("fill", d => d.fill).attr("opacity", 1))
    .on("pointermove", (e, d) => { showTip(e, d.tip); highlight(d.type ?? null); })
    .on("pointerleave", hideTip);
}

// Labels, lines, outlines and average markers. Like the marks, each has an id, so a label
// that appears in two steps (like a pitch-type row label) glides to its new spot.
function drawAnno(items, t) {
  gAnno.selectAll(".anno")
    .data(items, d => d.id)
    .join(
      enter => enter.append(d => document.createElementNS("http://www.w3.org/2000/svg", d.tag))
        .each(function (d) { for (const [k, v] of Object.entries(d.attrs)) this.setAttribute(k, v); })
        .attr("opacity", 0),
      update => update,
      exit => exit.transition(t).attr("opacity", 0).remove()
    )
    .attr("class", d => `anno ${d.cls ?? ""}${d.type ? " pitch" : ""}`)
    .each(function (d) { if (d.text != null) this.textContent = d.text; })
    .each(function (d) {
      const tr = d3.select(this).transition(t);
      for (const [k, v] of Object.entries(d.attrs)) tr.attr(k, v);
      tr.attr("opacity", d.opacity ?? 1);
    })
    .style("pointer-events", d => d.tip ? "all" : "none")
    .on("pointermove", (e, d) => { if (d.tip) { showTip(e, d.tip); highlight(d.type ?? null); } })
    .on("pointerleave", hideTip);
}

function rowLabel(type, y) {
  return { id: `row-${type}`, tag: "text", cls: "row-label", type,
    attrs: { x: -10, y, dy: "0.35em", "text-anchor": "end" }, text: type };
}

function axisLabel(id, x, y, text, anchor = "middle") {
  return { id, tag: "text", cls: "axis-label", attrs: { x, y, "text-anchor": anchor }, text };
}

// ---------- Rollover: tooltip + highlight ----------

let hoverDots = [], delaunay = null, dotTip = null, hoverType = null;

// Turn dot hovering on for a step. A Delaunay index finds the nearest dot to the
// pointer, so you don't have to land exactly on a 2-pixel circle.
function setDotHover(tipFn) {
  dotTip = tipFn;
  hoverDots = tipFn ? pitches.filter(d => (d.after ?? d.to) > 0.1) : [];
  delaunay = hoverDots.length ? d3.Delaunay.from(hoverDots, d => d.tx, d => d.ty) : null;
  overlay.style("display", delaunay ? null : "none");
}

overlay
  .on("pointermove", e => {
    if (!delaunay) return;
    const [mx, my] = d3.pointer(e);
    const d = hoverDots[delaunay.find(mx, my)];
    if (Math.hypot(d.tx - mx, d.ty - my) > 24) return hideTip();
    ring.attr("cx", d.tx).attr("cy", d.ty).attr("r", d.tr + 4).attr("opacity", 1);
    highlight(d.pitch_name);
    showTip(e, dotTip(d));
  })
  .on("pointerleave", hideTip);

// Fade everything except one pitch type (CSS transitions do the animation)
function highlight(type) {
  if (type === hoverType) return;
  hoverType = type;
  svg.classed("has-hover", !!type);
  dots.classed("hl", d => d.pitch_name === type);
  gMarks.selectAll(".mark").classed("hl", d => d.type === type);
  gAnno.selectAll(".anno").classed("hl", d => d.type === type);
  d3.select(legendEl).classed("has-hover", !!type)
    .selectAll(".legend-item").classed("hl", d => d === type);
}

function showTip(event, tip) {
  if (!tip) return;
  // Build the tooltip with textContent so data values are never treated as HTML
  const title = document.createElement("div");
  title.className = "tip-title";
  if (tip.color) {
    const key = document.createElement("span");
    key.className = "tip-key";
    key.style.background = tip.color;
    title.append(key);
  }
  title.append(tip.title);
  const rows = tip.rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "tip-row";
    const a = document.createElement("span"), b = document.createElement("span");
    a.textContent = label;
    b.textContent = value;
    row.append(a, b);
    return row;
  });
  tipEl.replaceChildren(title, ...rows);

  // Place it next to the pointer, flipped if it would run off the panel
  const box = figure.getBoundingClientRect();
  let x = event.clientX - box.left + 14, y = event.clientY - box.top + 14;
  if (x + tipEl.offsetWidth > box.width) x -= tipEl.offsetWidth + 28;
  if (y + tipEl.offsetHeight > box.height) y -= tipEl.offsetHeight + 28;
  tipEl.style.left = `${Math.max(0, x)}px`;
  tipEl.style.top = `${Math.max(0, y)}px`;
  tipEl.classList.add("show");
}

function hideTip() {
  tipEl.classList.remove("show");
  ring.attr("opacity", 0);
  highlight(null);
}

const fmtDate = d3.utcFormat("%b %-d, %Y");

function pitchTip(d) {
  return { title: d.pitch_name, color: color(d.pitch_name), rows: [
    ["Speed", `${mph(d.release_speed)} mph`],
    ["Count", d.count],
    ["Result", d.description ? d.description.replace(/_/g, " ") : "–"],
    ["Date", fmtDate(d.game_date)]
  ] };
}

function typeTip(type) {
  const n = typeCounts.get(type);
  return { title: type, color: color(type), rows: [
    ["Pitches", d3.format(",")(n)],
    ["Share", pct1(n / pitches.length)],
    ["Avg speed", `${mph(typeStats.get(type).speed)} mph`]
  ] };
}

// ---------- Step 1: usage (one dot per pitch, stacked into rows) ----------

function drawUsage(t) {
  const rows = order.usage;
  const y = d3.scaleBand(rows, [0, ih]).paddingInner(0.3).paddingOuter(0.1);
  const maxN = d3.max(rows, r => typeCounts.get(r));

  // Pick how many dots tall each row is so the dots come out as big as possible
  let best = { cell: 0, tall: 1 };
  for (let tall = 1; tall <= 60; tall++) {
    const cell = Math.min((iw * 0.8) / Math.ceil(maxN / tall), y.bandwidth() / tall);
    if (cell > best.cell) best = { cell, tall };
  }
  const { cell, tall } = best;

  for (const d of pitches) {
    const col = Math.floor(d.rank / tall), row = d.rank % tall;
    const top = y(d.pitch_name) + (y.bandwidth() - tall * cell) / 2;
    d.tx = col * cell + cell / 2;
    d.ty = top + row * cell + cell / 2;
    d.tr = Math.max(0.8, cell * 0.42);
    d.to = 0.9;
  }
  moveDots(t);
  drawAxes(t);
  drawMarks([], t);
  drawAnno([
    ...rows.map(r => rowLabel(r, y(r) + y.bandwidth() / 2)),
    ...rows.map(r => ({
      id: `n-${r}`, tag: "text", cls: "value-label", type: r,
      attrs: { x: Math.ceil(typeCounts.get(r) / tall) * cell + 8, y: y(r) + y.bandwidth() / 2, dy: "0.35em" },
      text: `${d3.format(",")(typeCounts.get(r))} · ${pct(typeCounts.get(r) / pitches.length)}`
    }))
  ], t);
  setDotHover(d => typeTip(d.pitch_name));
}

// ---------- Step 2: velocity (dots slide to their speed; rows re-sort fastest first) ----------

function drawVelo(t, highlightType = null) {
  const rows = order.velo;
  const x = d3.scaleLinear(d3.extent(pitches, d => d.release_speed), [0, iw]).nice();
  const y = d3.scaleBand(rows, [0, ih]).padding(0.25);
  const faded = type => highlightType && type !== highlightType;

  for (const d of pitches) {
    d.tx = x(d.release_speed);
    d.ty = y(d.pitch_name) + y.bandwidth() * (0.12 + 0.76 * d.j1);
    d.tr = narrow ? 1.6 : 2.2;
    d.to = faded(d.pitch_name) ? 0.04 : 0.35;
  }
  moveDots(t);
  drawAxes(t, { x });
  drawMarks([], t);

  const items = rows.map(r => rowLabel(r, y(r) + y.bandwidth() / 2));
  for (const r of rows) {
    const s = typeStats.get(r);
    items.push({
      id: `mean-${r}`, tag: "circle", type: r, opacity: faded(r) ? 0.3 : 1,
      attrs: { cx: x(s.speed), cy: y(r) + y.bandwidth() / 2, r: 7, fill: "white", stroke: color(r), "stroke-width": 3 },
      tip: { title: `${r} average`, color: color(r), rows: [
        ["Pitches", d3.format(",")(s.n)],
        ["Average", `${mph(s.speed)} mph`],
        ["Median", `${mph(s.median)} mph`],
        ["Range", `${mph(s.min)}–${mph(s.max)} mph`]
      ] }
    });
  }
  items.push(axisLabel("x-label", iw, ih + 38, "Release speed (mph) →", "end"));
  if (highlightType) {
    items.push({ id: "ref-100", tag: "line",
      attrs: { x1: x(100), x2: x(100), y1: 0, y2: ih, stroke: "#52514e", "stroke-dasharray": "4 3" } });
    items.push({ id: "ref-100-label", tag: "text", cls: "value-label",
      attrs: { x: x(100) + 4, y: -8 }, text: "100 mph" });
  }
  drawAnno(items, t);
  setDotHover(pitchTip);
}

// ---------- Step 3: movement (dots spread into clusters by spin-induced break) ----------

function drawMovement(t, highlightTypes = []) {
  // Axis ranges from the data, padded and rounded out to 6-inch steps
  const pad = ([lo, hi]) => [Math.floor((lo - 2) / 6) * 6, Math.ceil((hi + 2) / 6) * 6];
  const { x, y } = equalScales(pad(d3.extent(pitches, d => d.pfx_x * 12)), pad(d3.extent(pitches, d => d.pfx_z * 12)));
  const faded = type => highlightTypes.length > 0 && !highlightTypes.includes(type);

  for (const d of pitches) {
    d.tx = x(d.pfx_x * 12);
    d.ty = y(d.pfx_z * 12);
    d.tr = narrow ? 1.6 : 2.2;
    d.to = faded(d.pitch_name) ? 0.04 : 0.3;
  }
  moveDots(t);
  drawAxes(t, { x, y, xAt: y.range()[0], yAt: x.range()[0] });
  drawMarks([], t);

  const [left, right] = x.range(), [bottom, top] = y.range();
  const items = [
    { id: "zero-x", tag: "line", attrs: { x1: x(0), x2: x(0), y1: top, y2: bottom, stroke: "#a3a29e" } },
    { id: "zero-y", tag: "line", attrs: { x1: left, x2: right, y1: y(0), y2: y(0), stroke: "#a3a29e" } },
    { id: "side-left", tag: "text", cls: "value-label", attrs: { x: left + 4, y: bottom - 6 },
      text: rightHanded ? "← arm side" : "← glove side" },
    { id: "side-right", tag: "text", cls: "value-label", attrs: { x: right - 4, y: bottom - 6, "text-anchor": "end" },
      text: rightHanded ? "glove side →" : "arm side →" },
    axisLabel("x-label", right, bottom + 38, "Horizontal break (in, catcher's view) →", "end"),
    axisLabel("y-label", left - 30, top - 10, "↑ Induced vertical break (in)", "start")
  ];
  for (const r of order.usage) {
    const s = typeStats.get(r);
    items.push({
      id: `avg-${r}`, tag: "circle", type: r, opacity: faded(r) ? 0.3 : 1,
      attrs: { cx: x(s.mx), cy: y(s.mz), r: 8, fill: "white", stroke: color(r), "stroke-width": 3 },
      tip: { title: `${r} average`, color: color(r), rows: [
        ["Horizontal", `${inch(Math.abs(s.mx))} in ${(s.mx < 0) === rightHanded ? "arm side" : "glove side"}`],
        ["Vertical", `${inch(s.mz)} in`],
        ["Avg spin", `${d3.format(",.0f")(s.spin)} rpm`]
      ] }
    });
    items.push({
      id: `avglbl-${r}`, tag: "text", cls: "row-label strong", type: r, opacity: faded(r) ? 0.35 : 1,
      attrs: { x: x(s.mx) + 12, y: y(s.mz), dy: "0.35em", stroke: "white", "stroke-width": 4, "paint-order": "stroke" },
      text: r
    });
  }
  drawAnno(items, t);
  setDotHover(pitchTip);
}

// ---------- Step 4: location (dots land on the plate, then group into heatmap squares) ----------

const matchesFilter = d => state.pitchName === "All" || d.pitch_name === state.pitchName;

function drawLocation(t, heat = false) {
  const { x, y } = equalScales([-2, 2], [0, 5]);   // feet, same scale both ways

  for (const d of pitches) {
    d.tx = x(d.plate_x);
    d.ty = y(d.plate_z);
    d.tr = narrow ? 1.6 : 2.2;
    d.to = !matchesFilter(d) ? 0 : heat ? 0.06 : 0.45;
  }
  moveDots(t);
  drawAxes(t, { x, y, xAt: y.range()[0], yAt: x.range()[0] });

  // Heatmap squares: same 0.25 ft bins and 5-pitch minimum as the original's fixed heatmap
  let cells = [];
  if (heat) {
    const isWhiff = state.metric === "whiff";
    cells = binPitches(pitches.filter(matchesFilter), BIN_SIZE)
      .filter(b => (isWhiff ? b.swings : b.count) >= MIN_PITCHES)
      .map(b => {
        const v = isWhiff ? b.whiffRate : b.strikeRate;
        return {
          id: `bin-${b.x0.toFixed(2)}-${b.y0.toFixed(2)}`,
          x: x(b.x0) + 0.5, y: y(b.y1) + 0.5, w: x(b.x1) - x(b.x0) - 1, h: y(b.y0) - y(b.y1) - 1,
          fill: seqColor(v),
          tip: { title: `${isWhiff ? "Whiff" : "Strike"} rate ${pct1(v)}`, rows: [
            ["Pitches", b.count],
            ["Strike rate", pct1(b.strikeRate)],
            ["Swings", b.swings],
            ["Whiff rate", b.whiffRate == null ? "–" : pct1(b.whiffRate)]
          ] }
        };
      });
  }
  drawMarks(cells, t);

  const zone = strikeZone(data.located);
  const [left, right] = x.range(), [bottom, top] = y.range();
  drawAnno([
    { id: "zone", tag: "rect", attrs: {
      x: x(zone.x0), y: y(zone.y1), width: x(zone.x1) - x(zone.x0), height: y(zone.y0) - y(zone.y1),
      fill: "none", stroke: "#e34948", "stroke-width": 2 } },
    axisLabel("x-label", right, bottom + 38, "Horizontal location (ft, catcher's view) →", "end"),
    axisLabel("y-label", left - 30, top - 10, "↑ Height (ft)", "start")
  ], t);
  setDotHover(heat ? null : pitchTip);
}

// ---------- Step 5: counts (dots drop into stacked bars) ----------

function drawCounts(t, groupBy) {
  const groups = groupBy === "count" ? COUNT_ORDER : COUNT_STATES;
  const x = d3.scaleLinear([0, 1], [0, iw]);
  const y = d3.scaleBand(groups, [0, ih]).padding(groupBy === "count" ? 0.18 : 0.3);
  const segments = new Map(), marks = [], items = [];

  for (const g of groups) {
    const inGroup = pitches.filter(d => d[groupBy] === g);
    let cum = 0;
    for (const type of order.usage) {           // same stacking order (and colors) in every bar
      const n = inGroup.filter(d => d.pitch_name === type).length;
      const share = n / inGroup.length;
      const seg = {
        id: `${groupBy}-${g}-${type}`, type,
        x: x(cum) + 1, y: y(g), w: Math.max(0, x(share) - 2), h: y.bandwidth(),
        fromX: x(cum), fromW: 0, fill: color(type),
        delay: groupBy === "countState" ? 500 : 0,   // bars grow in after the dots arrive
        tip: { title: type, color: color(type), rows: [
          [groupBy === "count" ? "Count" : "Situation", g],
          ["Share", pct1(share)],
          ["Pitches", `${n} of ${inGroup.length}`]
        ] }
      };
      marks.push(seg);
      segments.set(`${g}|${type}`, seg);
      if (share >= 0.08 && seg.w > 26) {
        items.push({ id: `pl-${seg.id}`, tag: "text", cls: "cell-label", type,
          attrs: { x: seg.x + seg.w / 2, y: seg.y + seg.h / 2, dy: "0.35em", "text-anchor": "middle", fill: "#0b0b0b" },
          text: pct(share) });
      }
      cum += share;
    }
    items.push({ id: `grp-${g}`, tag: "text", cls: "row-label",
      attrs: { x: -10, y: y(g) + y.bandwidth() / 2, dy: "0.35em", "text-anchor": "end" },
      text: `${g} (${d3.format(",")(inGroup.length)})` });
  }

  // Each dot flies into its own bar segment, then fades as the bars fill in
  const flying = groupBy === "countState";
  for (const d of pitches) {
    const s = segments.get(`${d[groupBy]}|${d.pitch_name}`);
    if (s) { d.tx = s.x + s.w * d.j1; d.ty = s.y + s.h * d.j2; }
    d.tr = narrow ? 1.4 : 1.8;
    d.to = flying ? 0.8 : 0;
    d.after = 0;
  }
  moveDots(t);
  drawAxes(t, { x, xFormat: ".0%" });
  drawMarks(marks, t);
  items.push(axisLabel("x-label", iw, ih + 38, "Share of pitches →", "end"));
  drawAnno(items, t);
  setDotHover(null);
}

// ---------- Step 6: two-strike whiffs by zone ----------

// Where a dot sits inside its zone (grid units: strike zone 0–3, outside area -1 to 4).
// Outer zones are L-shaped, so a dot picks one of the L's two arms.
const OUTER_ARMS = {
  11: [[-1, 0, 1.5, 4], [0, 1.5, 3, 4]],
  12: [[3, 4, 1.5, 4], [1.5, 3, 3, 4]],
  13: [[-1, 0, -1, 1.5], [0, 1.5, -1, 0]],
  14: [[3, 4, -1, 1.5], [1.5, 3, -1, 0]]
};
function zonePoint(d) {
  const s = zoneShape(d.zone);
  const [u0, u1, v0, v1] = OUTER_ARMS[d.zone]?.[d.j3 < 0.5 ? 0 : 1] ?? [s.x0, s.x1, s.y0, s.y1];
  return [u0 + (u1 - u0) * (0.1 + 0.8 * d.j1), v0 + (v1 - v0) * (0.1 + 0.8 * d.j2)];
}

function drawZones(t, byPitch) {
  const groups = byPitch ? ["4-Seam Fastball", "Slider", "Curveball"] : ["All pitches"];
  const top = byPitch ? 24 : 0, gap = narrow ? 8 : 20;
  const k = Math.max(10, Math.min((iw - gap * (groups.length - 1)) / (5 * groups.length), (ih - top) / 5));
  const total = groups.length * 5 * k + gap * (groups.length - 1);
  const X = (gi, u) => (iw - total) / 2 + gi * (5 * k + gap) + (u + 1) * k;   // grid units -> pixels
  const Y = v => top + (4 - v) * k;
  const twoStrike = pitches.filter(d => d.strikes === 2);
  const marks = [], items = [];

  groups.forEach((g, gi) => {
    const inGroup = byPitch ? twoStrike.filter(d => d.pitch_name === g) : twoStrike;
    for (const z of ZONES) {
      const s = zoneShape(z);
      const inZone = inGroup.filter(d => d.zone === z);
      const swings = d3.sum(inZone, d => d.isSwing), whiffs = d3.sum(inZone, d => d.isWhiff);
      const enough = swings >= MIN_PITCHES, rate = swings ? whiffs / swings : null;
      marks.push({
        id: `zone-${g}-${z}`, x: X(gi, s.x0), y: Y(s.y1), w: (s.x1 - s.x0) * k, h: (s.y1 - s.y0) * k,
        fill: enough ? seqColor(rate) : "#efeeeb", stroke: "white", strokeWidth: 2, delay: 500,
        tip: { title: `Zone ${z}`, rows: [
          ["Pitch", g], ["Where", s.where], ["Swings", swings], ["Whiffs", whiffs],
          ["Whiff rate", enough ? pct1(rate) : "too few swings"]
        ] }
      });
      if (k >= 26) {
        items.push({ id: `zl-${g}-${z}`, tag: "text", cls: "cell-label",
          attrs: { x: X(gi, s.labelX), y: Y(s.labelY), dy: "0.35em", "text-anchor": "middle",
            fill: enough && rate > 0.45 ? "white" : "#0b0b0b" },
          text: enough ? pct(rate) : `${swings} sw` });
      }
    }
    items.push({ id: `zo-${g}`, tag: "rect",
      attrs: { x: X(gi, 0), y: Y(3), width: 3 * k, height: 3 * k, fill: "none", stroke: "#0b0b0b", "stroke-width": 1.5 } });
    if (byPitch) {
      items.push({ id: `fl-${g}`, tag: "text", cls: "facet-label", type: g,
        attrs: { x: X(gi, 1.5), y: top - 8, "text-anchor": "middle" }, text: g });
    }
  });

  // Two-strike pitches fly into their zone square, then fade as the colors fill in
  for (const d of pitches) {
    const gi = byPitch ? groups.indexOf(d.pitch_name) : 0;
    const show = d.strikes === 2 && gi >= 0;
    if (show) {
      const [u, v] = zonePoint(d);
      d.tx = X(gi, u);
      d.ty = Y(v);
    }
    d.tr = narrow ? 1.4 : 1.8;
    d.to = show ? 0.85 : 0;
    d.after = 0;
  }
  moveDots(t);
  drawAxes(t);
  drawMarks(marks, t);
  drawAnno(items, t);
  setDotHover(null);
}

// ---------- Step 7: summary (dots fade, headline tiles count up) ----------

function drawSummary(t) {
  for (const d of pitches) d.to = 0;
  moveDots(t);
  drawAxes(t);
  drawMarks([], t);
  drawAnno([], t);
  setDotHover(null);
}

function showTiles(show, animate) {
  tilesEl.hidden = !show;
  if (!show) { tilesEl.classList.remove("show"); return; }
  requestAnimationFrame(() => tilesEl.classList.add("show"));
  if (!animate) return;
  // Count each headline number up from 0
  tilesEl.querySelectorAll(".tile-value").forEach(el => {
    const final = el.dataset.final ?? (el.dataset.final = el.textContent);
    const parts = final.match(/^([\d.,]+)(.*)$/);
    if (!parts) return;
    const target = +parts[1].replace(/,/g, "");
    const decimals = (parts[1].split(".")[1] ?? "").length;
    d3.select(el).transition().duration(1000).ease(d3.easeCubicOut)
      .tween("text", () => {
        const i = d3.interpolateNumber(0, target);
        return u => { el.textContent = i(u).toFixed(decimals) + parts[2]; };
      });
  });
}

// ---------- Controls, legend and the step list ----------

const STEPS = {
  "usage": t => drawUsage(t),
  "velo": t => drawVelo(t),
  "velo-ff": t => drawVelo(t, "4-Seam Fastball"),
  "movement": t => drawMovement(t),
  "movement-ff-cu": t => drawMovement(t, ["4-Seam Fastball", "Curveball"]),
  "location": t => drawLocation(t, false),
  "heat": t => drawLocation(t, true),
  "count-state": t => drawCounts(t, "countState"),
  "count-detail": t => drawCounts(t, "count"),
  "zone": t => drawZones(t, false),
  "zone-pitch": t => drawZones(t, true),
  "summary": t => drawSummary(t)
};

function updateControls() {
  const s = state.step;
  controlsEl.hidden = !(s === "location" || s === "heat");
  metricToggle.hidden = s !== "heat";
  seqLegend.hidden = !(s === "heat" || s === "zone" || s === "zone-pitch");
  document.querySelector("#seq-label").textContent = s !== "heat" ? "Whiff rate with two strikes"
    : state.metric === "whiff" ? "Whiff rate (whiffs ÷ swings)" : "Strike rate";
  legendEl.style.visibility = s === "summary" ? "hidden" : "visible";
}

// Draw the current step. animate = false jumps straight there (used on resize).
function render(animate = true) {
  instant = !animate;
  hideTip();
  updateControls();
  measure();                                  // after controls, which change the chart's height
  for (const d of pitches) d.after = null;
  const t = svg.transition("step").duration(animate ? DURATION : 0).ease(d3.easeCubicInOut);
  STEPS[state.step](t);
  showTiles(state.step === "summary", animate);
}

function buildLegend() {
  d3.select(legendEl).selectAll(".legend-item")
    .data(order.usage)
    .join("span")
    .attr("class", "legend-item")
    .each(function (type) {
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = color(type);
      const label = document.createElement("span");
      label.textContent = type;
      this.replaceChildren(swatch, label);
    })
    .on("pointerenter", (e, type) => highlight(type))
    .on("pointerleave", () => highlight(null));
}

function setupControls() {
  for (const name of ["All", ...order.usage]) {
    const n = name === "All" ? pitches.length : typeCounts.get(name);
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${d3.format(",")(n)})`;
    pitchFilter.append(opt);
  }
  pitchFilter.addEventListener("change", () => { state.pitchName = pitchFilter.value; render(); });
  document.querySelectorAll("input[name=metric]").forEach(input => {
    input.addEventListener("change", () => { state.metric = input.value; render(); });
  });
}

function setMetric(metric) {
  state.metric = metric;
  document.querySelector(`input[name=metric][value=${metric}]`).checked = true;
}

// ---------- Story numbers (same calculations as js/main.js on the original page) ----------

function computeStats({ all, located, typed }) {
  const fastballs = typed.filter(d => d.pitch_name === "4-Seam Fastball").map(d => d.release_speed);
  const veloByType = PITCH_NAMES.map(name => ({
    name,
    mean: d3.mean(typed.filter(d => d.pitch_name === name), d => d.release_speed)
  }));
  const slowest = d3.least(veloByType, d => d.mean);
  const teams = new Set(all.map(d => d.inning_topbot === "Top" ? d.home_team : d.away_team));
  const team = [...teams].map(t => TEAM_NAMES[t] ?? t).join(" / ");
  const inZone = located.filter(d => d.zone >= 1 && d.zone <= 9);
  const outZone = located.filter(d => d.zone >= 11);
  const avgMove = (name, field) => d3.mean(typed.filter(d => d.pitch_name === name), d => d[field] * 12);
  const ffIVB = avgMove("4-Seam Fastball", "pfx_z");
  const cuIVB = avgMove("Curveball", "pfx_z");
  const dates = d3.extent(all, d => d.game_date);
  const fmtLong = d3.utcFormat("%B %-d, %Y");
  const named = all.filter(d => PITCH_NAMES.includes(d.pitch_name));
  const shareOf = (name, filter) => {
    const group = named.filter(filter);
    return group.filter(d => d.pitch_name === name).length / group.length;
  };
  const twoStrike = all.filter(d => d.strikes === 2 && Number.isFinite(d.zone));
  const whiffRate = group => d3.sum(group, d => d.isWhiff) / d3.sum(group, d => d.isSwing);
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
    pitches: d3.format(",")(all.length),
    games: new Set(all.map(d => d.game_pk)).size,
    dateRange: `${fmtLong(dates[0])} to ${fmtLong(dates[1])}`,
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
    binSize: BIN_SIZE,
    minPitches: MIN_PITCHES,
    inZoneStrike: pct(d3.mean(inZone, d => d.isStrike)),
    outZoneStrike: pct(d3.mean(outZone, d => d.isStrike)),
    whiffRate: pct(d3.sum(all, d => d.isWhiff) / d3.sum(all, d => d.isSwing)),
    ffAhead: pct(shareOf("4-Seam Fastball", d => d.countState === "Ahead")),
    ffBehind: pct(shareOf("4-Seam Fastball", d => d.countState === "Behind")),
    cuAhead: pct(shareOf("Curveball", d => d.countState === "Ahead")),
    cuBehind: pct(shareOf("Curveball", d => d.countState === "Behind")),
    ff30: pct(shareOf("4-Seam Fastball", d => d.count === "3-0")),
    n30: named.filter(d => d.count === "3-0").length,
    ts2Swings: d3.format(",")(d3.sum(twoStrike, d => d.isSwing)),
    ts2Whiff: pct(whiffRate(twoStrike)),
    ts2In: pct(whiffRate(twoStrike.filter(d => d.zone <= 9))),
    ts2Out: pct(whiffRate(twoStrike.filter(d => d.zone >= 11))),
    ffBestWhere: ffBest.where, ffBestRate: ffBest.rate, ffBestSwings: ffBest.swings,
    cuBestWhere: cuBest.where, cuBestRate: cuBest.rate, cuBestSwings: cuBest.swings
  };
}

// ---------- Scrolling ----------

function activateStep(element) {
  document.querySelectorAll(".step").forEach(s => s.classList.toggle("is-active", s === element));
  state.step = element.dataset.step;
  if (element.dataset.metric) setMetric(element.dataset.metric);
  render(true);
}

function setupScroll() {
  const isNarrow = window.matchMedia("(max-width: 800px)").matches;
  const scroller = scrollama();
  scroller
    .setup({ step: ".step", offset: isNarrow ? 0.8 : 0.5 })
    .onStepEnter(({ element }) => activateStep(element));

  // Backup check (same as the original page): show the last step above the trigger line
  // after a reload partway down or a very fast scroll
  function syncStep() {
    const triggerY = window.innerHeight * (isNarrow ? 0.8 : 0.5);
    const passed = [...document.querySelectorAll(".step")].filter(s => s.getBoundingClientRect().top < triggerY);
    const current = passed[passed.length - 1];
    if (current && !current.classList.contains("is-active")) activateStep(current);
  }
  syncStep();
  let scrollTimer;
  window.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(syncStep, 150); });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { scroller.resize(); render(false); }, 200);
  });
}

// ---------- Start ----------

loadPitches().then(loaded => {
  data = loaded;

  // Pitches that can be drawn in every layout: known type, speed, movement and location
  pitches = data.all.filter(d => PITCH_NAMES.includes(d.pitch_name) &&
    [d.release_speed, d.pfx_x, d.pfx_z, d.plate_x, d.plate_z].every(Number.isFinite));
  pitches.forEach((d, i) => { d.j1 = rand(i, 1); d.j2 = rand(i, 2); d.j3 = rand(i, 3); });
  for (const group of d3.group(pitches, d => d.pitch_name).values()) group.forEach((d, k) => { d.rank = k; });

  // Per-type numbers used by labels and tooltips
  typeCounts = d3.rollup(pitches, v => v.length, d => d.pitch_name);
  typeStats = new Map(PITCH_NAMES.map(name => {
    const g = pitches.filter(d => d.pitch_name === name);
    return [name, {
      n: g.length,
      speed: d3.mean(g, d => d.release_speed), median: d3.median(g, d => d.release_speed),
      min: d3.min(g, d => d.release_speed), max: d3.max(g, d => d.release_speed),
      mx: d3.mean(g, d => d.pfx_x * 12), mz: d3.mean(g, d => d.pfx_z * 12),
      spin: d3.mean(g, d => d.release_spin_rate)
    }];
  }));
  order.usage = d3.sort(PITCH_NAMES, n => -typeCounts.get(n));     // most thrown first
  order.velo = d3.sort(PITCH_NAMES, n => -typeStats.get(n).speed); // fastest first
  rightHanded = d3.mode(pitches, d => d.p_throws) === "R";

  // Text numbers and closing tiles
  stats = computeStats(data);
  document.querySelectorAll("[data-stat]").forEach(el => { el.textContent = stats[el.dataset.stat]; });
  tilesEl.replaceChildren(...summaryTiles(stats).children);

  buildLegend();
  setupControls();

  // One circle per pitch. They start in the middle and spread out on the first step.
  measure();
  dots = gDots.selectAll("circle")
    .data(pitches)
    .join("circle")
    .attr("class", "dot")
    .attr("fill", d => color(d.pitch_name))
    .attr("cx", iw / 2).attr("cy", ih / 2).attr("r", 0).attr("fill-opacity", 0);

  console.log("Animated draft: dots", pitches.length);
  render(true);
  setupScroll();
});
