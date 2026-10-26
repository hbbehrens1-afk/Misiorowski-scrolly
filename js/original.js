// Faithful port of the original Observable notebook heatmap.
// Logic is unchanged on purpose so it can be compared with the fixed version later.

d3.csv("data/savant_data.csv", d3.autoType).then(data => {
  console.log("Rows loaded:", data.length);

  // Clean: drop pitches without a location, flag strikes
  const cleanData = data
    .filter(d => Number.isFinite(d.plate_x) && Number.isFinite(d.plate_z))
    .map(d => ({
      ...d,
      isStrike: [
        "called_strike",
        "swinging_strike",
        "swinging_strike_blocked",
        "foul",
        "foul_tip"
      ].includes(d.description) ? 1 : 0
    }));
  console.log("Rows after cleaning:", cleanData.length);

  const binSizeX = 0.05;
  const binSizeY = 0.05;

  // Bin by location and compute strike rate per bin
  const heatmapData = Array.from(
    d3.rollup(
      cleanData,
      pitches => ({
        count: pitches.length,
        strikeRate: d3.mean(pitches, d => d.isStrike)
      }),
      d => Math.floor(d.plate_x / binSizeX) * binSizeX,
      d => Math.floor(d.plate_z / binSizeY) * binSizeY
    ),
    ([x, yMap]) =>
      Array.from(yMap, ([y, stats]) => ({
        x0: x,
        x1: x + binSizeX,
        y0: y,
        y1: y + binSizeY,
        count: stats.count,
        strikeRate: stats.strikeRate
      }))
  ).flat();
  console.log("Bins:", heatmapData.length);

  // Plot: heatmap + red strike zone outline
  const chart = Plot.plot({
    width: 650,
    height: 650,
    x: { domain: [-2, 2], label: "Horizontal pitch location" },
    y: { domain: [0, 5], label: "Vertical pitch location" },
    color: { label: "Strike rate", scheme: "Blues", domain: [0, 1] },
    marks: [
      Plot.rect(heatmapData, {
        x1: "x0", x2: "x1", y1: "y0", y2: "y1",
        fill: "strikeRate",
        title: d => `Strike rate: ${(d.strikeRate * 100).toFixed(1)}%\nPitches: ${d.count}`
      }),
      Plot.rect(
        [{ x0: -0.83, x1: 0.83, y0: 1.5, y1: 3.5 }],
        { x1: "x0", x2: "x1", y1: "y0", y2: "y1",
          fillOpacity: 0, stroke: "red", strokeWidth: 2 }
      )
    ]
  });

  document.querySelector("#chart").append(chart);
  document.querySelector("#status").textContent =
    `${data.length} rows loaded · ${cleanData.length} after cleaning · ${heatmapData.length} bins`;
});
