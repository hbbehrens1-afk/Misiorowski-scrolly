// break-viewer.js — 3D pitch-break viewer in the movement step of animated.html.
// Pick a pitch type and watch one real pitch of that type fly from his hand to the catcher.
// The solid line is its real path; the dashed line is the same throw with no spin (gravity
// and drag only), so the gap between them is the break. Reuses the game's pitch physics.
// Overlay mode throws two pitch types at once, both aimed at the middle of the zone, so the
// gap where they cross the plate comes only from their different speed and spin.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { S, MOUND_Y, MOUND_H, buildBall } from "./game-scene.js";
import { FRONT_OF_PLATE, preparePitch, pitchAt } from "./game-physics.js";

const GRAVITY = 32.17;
const color = d3.scaleOrdinal(PITCH_NAMES, PITCH_COLORS);   // same colors as the story

// ---------- Page elements ----------
const stage = document.querySelector("#bv-stage");
const picker = document.querySelector("#bv-picker");
const slider = document.querySelector("#bv-speed");
const speedLabel = document.querySelector("#bv-speed-value");
const realLabel = document.querySelector("#bv-real");
const caption = document.querySelector("#bv-caption");
const note = document.querySelector("#bv-note");
const viewer = document.querySelector("#break-viewer");
const overlayBtn = document.querySelector("#bv-overlay");
const expandBtn = document.querySelector("#bv-expand");

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
// Size the canvas here instead of only in CSS: if the stylesheet ever fails to load (or an old
// cached copy is used), the canvas would otherwise grow every time it's resized.
Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
if (stage.clientHeight === 0 || stage.clientHeight > 2000) stage.style.height = "280px";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe0f1);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-40, 80, 30);
scene.add(sun);

const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
const grass = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x3f8a3a));
grass.rotation.x = -Math.PI / 2;
grass.position.z = -30;
scene.add(grass);

// Dirt around home plate and the mound, the mound itself, and home plate
for (const [y, r] of [[0, 10], [MOUND_Y, 9]]) {
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat(0xb9875a));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.copy(S(0, y, 0.02));
  scene.add(dirt);
}
const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 9, MOUND_H, 40), mat(0xb9875a));
mound.position.copy(S(0, MOUND_Y, MOUND_H / 2));
scene.add(mound);
const plateShape = new THREE.Shape([[-0.708, 17 / 12], [0.708, 17 / 12], [0.708, 0.708], [0, 0], [-0.708, 0.708]]
  .map(([x, y]) => new THREE.Vector2(x, y)));
const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshBasicMaterial({ color: 0xffffff }));
plate.rotation.x = -Math.PI / 2;
plate.position.y = 0.05;
scene.add(plate);

// Catcher: a simple crouched figure with a mitt, just behind the plate. See-through, so he
// doesn't hide the end of the pitch from the catcher's-eye view.
const catcher = new THREE.Group();
const ghost = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, transparent: true, opacity: 0.35, depthWrite: false });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 0.9, 6, 12), ghost(0x2b2f36));
body.position.y = 1.6;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), ghost(0x1a1d22));
head.position.y = 3.0;
const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat(0x5a3519));
mitt.scale.set(1, 1, 0.5);
mitt.position.set(0.3, 2.4, 0.9);
catcher.add(body, head, mitt);
catcher.position.copy(S(0, -2.6, 0));
scene.add(catcher);

// Strike zone outline at the front of the plate (set once the data loads)
const zoneLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
scene.add(zoneLine);


// ---------- Balls and paths ----------
// Two of everything, so overlay mode can throw two pitches at once. The balls are a little
// bigger than life so they're easy to follow. Paths are thin tubes so they stay visible from
// any angle (plain WebGL lines are only 1 pixel wide).
const slots = [0, 1].map(() => {
  const ball = buildBall(0.16);
  const pathMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const path = new THREE.Mesh(new THREE.BufferGeometry(), pathMat);
  // Where the pitch crosses the plate: a ring in the pitch color
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  scene.add(ball, path, ring);
  return { ball, path, pathMat, ring, pitch: null, at: null };
});
const noSpinMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
const noSpinPath = new THREE.Group();          // dashes: short tube pieces with gaps between them
scene.add(noSpinPath);
// Overlay mode: a line between the two plate crossings shows how far apart they end up
const gapLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x111111 }));
scene.add(gapLine);

// ---------- Camera and mouse orbit ----------
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
// Two fixed views. Statcast measures left/right from the catcher's side, so in the catcher's view
// a right-hander releases on your LEFT. The TV view (from center field) is the mirror image.
const VIEWS = {
  catcher: { pos: S(0, -11, 6.2), target: S(0, 25, 2.6), fov: 35,
    label: "Catcher's view: a right-hander releases on your left" },
  // Like a broadcast camera: far behind the mound with a zoomed-in (telephoto) lens
  tv: { pos: S(0, 115, 13), target: S(0, 4, 3.4), fov: 7,
    label: "TV view (behind the pitcher): his arm is on your right" }
};
const viewLabel = document.querySelector("#bv-view-label");
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;          // the mouse wheel keeps scrolling the page
controls.enablePan = false;           // no damping, so the view buttons land exactly on their view
function setView(name) {
  const v = VIEWS[name];
  camera.position.copy(v.pos);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  controls.target.copy(v.target);
  controls.update();
  viewLabel.textContent = v.label;
}
setView("catcher");
document.querySelector("#bv-reset").addEventListener("click", () => setView("catcher"));
document.querySelector("#bv-tv").addEventListener("click", () => setView("tv"));
// Once you drag, it's no longer one of the fixed views
controls.addEventListener("start", () => { viewLabel.textContent = "Custom view (drag to rotate)"; });

// On touch screens, a finger on the viewer must scroll the page, so orbit is turned off there
const touchOnly = window.matchMedia("(hover: none)").matches;
if (touchOnly) {
  controls.enabled = false;
  renderer.domElement.style.touchAction = "pan-y";
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h || h > 3000) return;               // ignore impossible sizes instead of feeding them back
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------- Pitch paths ----------
let reps = new Map();      // pitch type → its representative real pitch (with flight path)
let zoneMid = { x: 0, z: 2.5 };
let overlay = false;       // overlay mode on/off
let chosen = [];           // the pitch type (or two types in overlay mode) being shown

// The same throw with no spin: same release point and velocity, but only gravity and the
// drag along the throw (ay) act on it. Spin is what makes the real path bend away from this.
function noSpinAt(p, e) {
  const t0 = p.tRelease, r = pitchAt(p, 0);
  const v = { x: p.vx0 + p.ax * t0, y: p.vy0 + p.ay * t0, z: p.vz0 + p.az * t0 };
  return { x: r.x + v.x * e, y: r.y + v.y * e + 0.5 * p.ay * e * e, z: r.z + v.z * e - 0.5 * GRAVITY * e * e };
}

// For overlay mode: the same real pitch (release point, speed and spin), but thrown so that
// without spin it would hit the middle of the zone. Both pitches get the same aim, so where
// they really end up differs only because of their speed and spin.
function aimedAt(p, target) {
  const r = pitchAt(p, 0), T = p.flightTime;
  const vy = p.vy0 + p.ay * p.tRelease;
  const vx = (target.x - r.x) / T;                              // no-spin path hits target.x at T
  const vz = (target.z - r.z + 0.5 * GRAVITY * T * T) / T;      // ...and target.z
  return e => ({
    x: r.x + vx * e + 0.5 * p.ax * e * e,
    y: r.y + vy * e + 0.5 * p.ay * e * e,
    z: r.z + vz * e + 0.5 * p.az * e * e
  });
}

function pathPoints(at, T) {
  return d3.range(0, 61).map(i => {
    const q = at((T * i) / 60);
    return S(q.x, q.y, q.z);
  });
}

const tube = (points, radius) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, radius, 8);

// Show the chosen pitch(es): paths, plate rings, dashed no-spin path (single mode only), caption
function show() {
  picker.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", chosen.includes(b.dataset.type)));
  slots.forEach((slot, i) => {
    const type = chosen[i];
    const visible = type !== undefined;
    for (const obj of [slot.ball, slot.path, slot.ring]) obj.visible = visible;
    if (!visible) return;
    const p = reps.get(type);
    slot.pitch = p;
    slot.at = overlay ? aimedAt(p, zoneMid) : (e => pitchAt(p, e));
    slot.path.geometry.dispose();
    slot.path.geometry = tube(pathPoints(slot.at, p.flightTime), 0.05);
    slot.pathMat.color.set(color(type));
    slot.ring.material.color.set(color(type));
    const end = slot.at(p.flightTime);
    slot.ring.position.copy(S(end.x, FRONT_OF_PLATE, end.z));
  });

  // Dashed no-spin path: only when showing a single pitch
  noSpinPath.children.forEach(m => m.geometry.dispose());
  noSpinPath.clear();
  if (!overlay) {
    const p = slots[0].pitch;
    const pts = pathPoints(e => noSpinAt(p, e), p.flightTime);
    for (let i = 0; i + 2 < pts.length; i += 4) noSpinPath.add(new THREE.Mesh(tube(pts.slice(i, i + 3), 0.035), noSpinMat));
  }

  // Caption (and the gap line in overlay mode)
  gapLine.visible = overlay;
  if (overlay) {
    const [a, b] = slots, ea = a.at(a.pitch.flightTime), eb = b.at(b.pitch.flightTime);
    gapLine.geometry.dispose();
    gapLine.geometry = tube([S(ea.x, FRONT_OF_PLATE, ea.z), S(eb.x, FRONT_OF_PLATE, eb.z)], 0.02);
    const dx = Math.abs(ea.x - eb.x) * 12, dz = Math.abs(ea.z - eb.z) * 12;
    const ms = Math.round(Math.abs(a.pitch.flightTime - b.pitch.flightTime) * 1000);
    const slower = a.pitch.flightTime > b.pitch.flightTime ? chosen[0] : chosen[1];
    caption.textContent = `${chosen[0]} vs. ${chosen[1]}: aimed at the same spot, they cross the plate ` +
      `${inch(Math.hypot(dx, dz))} in apart (${inch(dx)} in sideways, ${inch(dz)} in up and down). ` +
      `The ${slower.toLowerCase()} gets there ${ms} ms later.`;
    note.textContent = "Overlay: both pitches leave his hand at the same moment, each from its real release point. Pick any two pitch types.";
  } else {
    const p = slots[0].pitch, type = chosen[0];
    const side = p.pfx_x < 0 ? "arm side" : "glove side";   // right-hander, catcher's view
    caption.textContent = `${type}: ${inch(Math.abs(p.pfx_x * 12))} in ${side} and ` +
      `${inch(p.pfx_z * 12)} in induced vertical break (a real pitch close to his average ${type.toLowerCase()}).`;
    note.textContent = "Solid line: the real pitch. Dashed line: the same throw with no spin.";
  }
  if (!touchOnly) note.textContent += " Drag to look from any angle.";
  updateSpeedLabel();
  simTime = 0;                                   // start again from his hand
}

// Picker: one type normally; in overlay mode a click swaps out the older of the two choices
function pick(type) {
  if (!overlay) chosen = [type];
  else if (!chosen.includes(type)) chosen = [chosen[1], type];
  show();
}

// Overlay on: keep the current pitch and add the type whose movement is most different from it
overlayBtn.addEventListener("click", () => {
  overlay = !overlay;
  overlayBtn.setAttribute("aria-pressed", overlay);
  if (overlay) {
    const a = reps.get(chosen[0]);
    const other = d3.greatest([...reps.keys()].filter(t => t !== chosen[0]),
      t => Math.hypot(reps.get(t).pfx_x - a.pfx_x, reps.get(t).pfx_z - a.pfx_z));
    chosen = [chosen[0], other];
  } else {
    chosen = [chosen[1]];
  }
  show();
});

// "0.25× · real: 98.1 mph, 377 ms to the plate" (both pitches in overlay mode)
function updateSpeedLabel() {
  if (!slots[0].pitch) return;
  speedLabel.textContent = `${(+slider.value).toFixed(2)}×`;
  const real = slots.filter(s => s.ball.visible).map(s => `${mph(s.pitch.release_speed)} mph, ${Math.round(s.pitch.flightTime * 1000)} ms`);
  realLabel.textContent = `· real: ${real.join(" vs. ")} to the plate`;
}
slider.addEventListener("input", updateSpeedLabel);

// ---------- Full screen ----------
// The viewer moves into a fixed panel that covers the window (works on phones too, where the
// browser's real full-screen mode isn't always available). A placeholder keeps its spot.
const placeholder = document.createComment("break viewer goes here");
function setExpanded(on) {
  if (on === viewer.classList.contains("bv-expanded")) return;
  if (on) { viewer.before(placeholder); document.body.append(viewer); }
  else placeholder.replaceWith(viewer);
  viewer.classList.toggle("bv-expanded", on);
  document.body.classList.toggle("bv-lock", on);          // stop the page scrolling behind it
  expandBtn.textContent = on ? "Close full screen" : "Full screen";
  expandBtn.setAttribute("aria-pressed", on);
  resize();
  lastFrame = performance.now();
  renderer.setAnimationLoop(frame);                        // keep animating while expanded
}
expandBtn.addEventListener("click", () => setExpanded(!viewer.classList.contains("bv-expanded")));
window.addEventListener("keydown", e => { if (e.key === "Escape") setExpanded(false); });

// ---------- Animation (only while the viewer is on screen) ----------
let simTime = 0, lastFrame = performance.now();
const PAUSE = 0.6;          // seconds (of pitch time) the balls rest in the mitt before replaying

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  simTime += dt * slider.value;                   // slider = fraction of real speed
  const shown = slots.filter(s => s.ball.visible && s.pitch);
  if (shown.length) {
    const loop = d3.max(shown, s => s.pitch.flightTime) + 0.08 + PAUSE;
    const e = simTime % loop;
    for (const s of shown) {
      const q = s.at(Math.min(e, s.pitch.flightTime + 0.08));   // a little past the plate, into the mitt
      s.ball.position.copy(S(q.x, q.y, q.z));
      s.ball.rotation.x -= dt * slider.value * 60;               // spin
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

new IntersectionObserver(([entry]) => {
  if (viewer.classList.contains("bv-expanded")) return;    // full screen keeps its own loop
  lastFrame = performance.now();
  renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
}).observe(stage);

// ---------- Load the data ----------
loadPitches().then(({ all }) => {
  const need = ["vx0", "vy0", "vz0", "ax", "ay", "az", "plate_x", "plate_z", "release_extension", "pfx_x", "pfx_z", "release_speed"];
  const pool = all.filter(d => PITCH_NAMES.includes(d.pitch_name) && need.every(k => Number.isFinite(d[k])));

  // Representative pitch: the real pitch closest to its type's average movement
  const byType = d3.group(pool, d => d.pitch_name);
  for (const [type, list] of byType) {
    const mx = d3.mean(list, d => d.pfx_x), mz = d3.mean(list, d => d.pfx_z);
    reps.set(type, preparePitch(d3.least(list, d => Math.hypot(d.pfx_x - mx, d.pfx_z - mz))));
  }

  // Strike zone: average top and bottom for the hitters he faced (overlay pitches aim at its middle)
  const top = d3.mean(pool, d => d.sz_top), bot = d3.mean(pool, d => d.sz_bot);
  zoneMid = { x: 0, z: (top + bot) / 2 };
  zoneLine.geometry.setFromPoints([S(-0.83, FRONT_OF_PLATE, bot), S(0.83, FRONT_OF_PLATE, bot),
    S(0.83, FRONT_OF_PLATE, top), S(-0.83, FRONT_OF_PLATE, top)]);

  // One button per pitch type, most thrown first
  const order = d3.sort(byType.keys(), t => -byType.get(t).length);
  for (const type of order) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.type = type;
    const key = document.createElement("span");
    key.className = "dot-key";
    key.style.background = color(type);
    b.append(key, type);
    b.addEventListener("click", () => pick(type));
    picker.append(b);
  }
  chosen = [order[0]];
  show();
  resize();
});
