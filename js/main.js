// main.js — loads the data, fills in the numbers in the text,
// and redraws the sticky chart whenever a new step scrolls into view.

const chartEl = document.querySelector("#chart");
const controlsEl = document.querySelector("#controls");
const pitchFilter = document.querySelector("#pitch-filter");

// What the chart is currently showing
const state = { chart: "usage", metric: "strike", pitchName: "All" };

let data;  // filled in once the CSV loads
let stats; // every number shown in the text, computed from data

// Team abbreviations we need to spell out in the text
const TEAM_NAMES = { MIL: "Milwaukee Brewers" };

// ---------- 1. Compute every number used in the text ----------

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

// Put each stat into every <span data-stat="name"> on the page
function fillStats(stats) {
  document.querySelectorAll("[data-stat]").forEach(el => {
    el.textContent = stats[el.dataset.stat];
  });
}

// ---------- 2. Draw the chart for the current state ----------

function render() {
  const isHeat = state.chart === "heat";
  controlsEl.hidden = !isHeat;

  // Measure the space left for the chart (after controls are shown/hidden)
  const size = { width: chartEl.clientWidth, height: chartEl.clientHeight };

  let chart;
  if (state.chart === "usage") {
    chart = usageChart(data.all.filter(d => PITCH_NAMES.includes(d.pitch_name)), size);
  } else if (state.chart === "velo") {
    chart = veloChart(data.typed, size);
  } else if (state.chart === "velo-ff") {
    chart = veloChart(data.typed, { ...size, highlight: "4-Seam Fastball" });
  } else if (state.chart === "movement") {
    chart = movementChart(data.typed, size);
  } else if (state.chart === "movement-ff-cu") {
    chart = movementChart(data.typed, { ...size, highlight: ["4-Seam Fastball", "Curveball"] });
  } else if (state.chart === "count-state") {
    chart = countMixChart(data.all.filter(d => PITCH_NAMES.includes(d.pitch_name)), size);
  } else if (state.chart === "count-detail") {
    chart = countMixChart(data.all.filter(d => PITCH_NAMES.includes(d.pitch_name)), { ...size, groupBy: "count" });
  } else if (state.chart === "zone-whiff") {
    chart = zoneWhiffChart(data.all, size);
  } else if (state.chart === "zone-whiff-pitch") {
    chart = zoneWhiffChart(data.all, { ...size, byPitch: true });
  } else if (state.chart === "summary") {
    chart = summaryTiles(stats);
  } else if (state.chart === "heat-original") {
    chart = originalHeatmap(data.located, size);
  } else if (isHeat) {
    chart = locationHeatmap(data.located, { ...size, metric: state.metric, pitchName: state.pitchName });
  }

  chartEl.replaceChildren(chart);
}

// ---------- 3. Controls for the location chart ----------

function setupControls() {
  // Pitch-type menu: "All" plus each pitch type with its count
  const options = ["All", ...PITCH_NAMES];
  options.forEach(name => {
    const n = name === "All" ? data.located.length : data.located.filter(d => d.pitch_name === name).length;
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${d3.format(",")(n)})`;
    pitchFilter.append(opt);
  });

  pitchFilter.addEventListener("change", () => {
    state.pitchName = pitchFilter.value;
    render();
  });

  document.querySelectorAll("input[name=metric]").forEach(input => {
    input.addEventListener("change", () => {
      state.metric = input.value;
      render();
    });
  });
}

// Keep the radio buttons in sync when a step changes the metric
function setMetric(metric) {
  state.metric = metric;
  document.querySelector(`input[name=metric][value=${metric}]`).checked = true;
}

// ---------- 4. Scrollama: react to steps entering the screen ----------

// Highlight a step's text and switch the chart to that step's view
function activateStep(element) {
  document.querySelectorAll(".step").forEach(s => s.classList.toggle("is-active", s === element));
  state.chart = element.dataset.chart;
  if (element.dataset.metric) setMetric(element.dataset.metric);
  render();
}

function setupScroll() {
  const scroller = scrollama();
  const isNarrow = window.matchMedia("(max-width: 800px)").matches;

  scroller
    .setup({
      step: ".step",
      // On phones the chart covers the top of the screen, so trigger lower down
      offset: isNarrow ? 0.8 : 0.5
    })
    .onStepEnter(({ element }) => activateStep(element));

  // Backup check: Scrollama can miss a step when the page loads already scrolled down
  // (after a reload) or after a very fast jump. This finds the last step above the
  // trigger line and shows it, if it isn't showing already.
  function syncStep() {
    const triggerY = window.innerHeight * (isNarrow ? 0.8 : 0.5);
    const passed = [...document.querySelectorAll(".step")].filter(s => s.getBoundingClientRect().top < triggerY);
    const current = passed[passed.length - 1];
    if (current && !current.classList.contains("is-active")) activateStep(current);
  }
  syncStep();

  // Run the backup check once scrolling pauses
  let scrollTimer;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncStep, 150);
  });

  // Redraw at the new size when the window is resized (wait until resizing stops)
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { scroller.resize(); render(); }, 200);
  });
}

// ---------- Start ----------

loadPitches().then(loaded => {
  data = loaded;
  console.log("Rows loaded:", data.all.length, "| with location:", data.located.length);
  stats = computeStats(data);
  fillStats(stats);
  setupControls();
  render();          // draw the first chart before any scrolling
  setupScroll();
});
