// data.js — loads the CSV once, cleans it, and holds helper functions
// that the charts share. Every number on the site comes from here.

// ---------- Pitch-call definitions (Statcast "description" values) ----------

// The original notebook's strike list (kept so we can show the "before" chart).
const ORIGINAL_STRIKE_CALLS = [
  "called_strike", "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip"
];

// Fixed strike list: anything that isn't a ball counts as a strike for the pitcher,
// including balls put in play and bunt attempts.
const STRIKE_CALLS = [
  ...ORIGINAL_STRIKE_CALLS,
  "hit_into_play", "missed_bunt", "foul_bunt", "automatic_strike"
];

// A swing is any pitch the batter offered at.
const SWING_CALLS = [
  "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip",
  "foul_bunt", "hit_into_play", "missed_bunt"
];

// A whiff is a swing that missed the ball completely.
const WHIFF_CALLS = ["swinging_strike", "swinging_strike_blocked", "missed_bunt"];

// ---------- Pitch types: fixed order and fixed colors ----------
// Each pitch type keeps the same color on every chart.
const PITCH_TYPES = [
  { code: "FF", name: "4-Seam Fastball", color: "#2a78d6" },
  { code: "SL", name: "Slider",          color: "#eb6834" },
  { code: "CU", name: "Curveball",       color: "#1baf7a" },
  { code: "FC", name: "Cutter",          color: "#eda100" },
  { code: "CH", name: "Changeup",        color: "#e87ba4" }
];
const PITCH_NAMES = PITCH_TYPES.map(p => p.name);
const PITCH_COLORS = PITCH_TYPES.map(p => p.color);

// ---------- Counts ----------

// From the pitcher's point of view: more strikes than balls = ahead.
function countState(balls, strikes) {
  if (strikes > balls) return "Ahead";
  if (balls > strikes) return "Behind";
  return "Even";
}
const COUNT_STATES = ["Ahead", "Even", "Behind"];

// All 12 ball-strike counts, in order
const COUNTS = d3.range(4).flatMap(b => d3.range(3).map(s => `${b}-${s}`));

// ---------- Load + clean ----------

async function loadPitches() {
  const raw = await d3.csv("data/savant_data.csv", d3.autoType);

  // Add yes/no (1/0) flags to every pitch so charts can average them into rates.
  const all = raw.map(d => ({
    ...d,
    isStrike: STRIKE_CALLS.includes(d.description) ? 1 : 0,
    isOriginalStrike: ORIGINAL_STRIKE_CALLS.includes(d.description) ? 1 : 0,
    isSwing: SWING_CALLS.includes(d.description) ? 1 : 0,
    isWhiff: WHIFF_CALLS.includes(d.description) ? 1 : 0,
    count: `${d.balls}-${d.strikes}`,       // e.g. "1-2" = 1 ball, 2 strikes
    countState: countState(d.balls, d.strikes)
  }));

  // Pitches that have a plate location (used by the heatmaps).
  const located = all.filter(d => Number.isFinite(d.plate_x) && Number.isFinite(d.plate_z));

  // Pitches that have a known type and speed (used by the velocity chart).
  const typed = all.filter(d => PITCH_NAMES.includes(d.pitch_name) && Number.isFinite(d.release_speed));

  return { all, located, typed };
}

// ---------- Binning for heatmaps ----------

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

// The strike zone: 17-inch plate plus a ball's width on each side (±0.83 ft),
// and the average top/bottom of the zone across the batters he faced.
function strikeZone(pitches) {
  return {
    x0: -0.83, x1: 0.83,
    y0: d3.mean(pitches, d => d.sz_bot),
    y1: d3.mean(pitches, d => d.sz_top)
  };
}
