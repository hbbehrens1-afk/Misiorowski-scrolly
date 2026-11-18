// game.js — "Face Misiorowski": bat against his real pitches in 3D (three.js).
// Pitches: real Statcast pitches played at real speed (game-physics.js).
// Field, pitcher, batter: game-scene.js. Pitcher's delivery: game-poses.js.
import * as THREE from "three";
import { S, MOUND_Y, MOUND_H, buildPark, buildPitcher, buildBatter, buildBat, buildBall } from "./game-scene.js";
import { FRONT_OF_PLATE, CONTACT_DELAY, SWEET_RADIUS, preparePitch, pitchAt, judgeSwing,
  simulateHit, directionWord, battedType } from "./game-physics.js";
import { RELEASE_U, releasePose, setPose, deliveryPose, mixPose, applyPose } from "./game-poses.js";

const WINDUP = 1.45;               // seconds for the whole delivery
const RELEASE_AT = WINDUP * RELEASE_U;
const SWING_TIME = 0.32;           // seconds for the whole swing animation
const RESULT_PAUSE = 3.2;          // seconds to show a result before the next pitch (time to settle in)
const BALL_R = 0.121;
const ZONE_HALF = 0.83;
const color = d3.scaleOrdinal(PITCH_NAMES, PITCH_COLORS);   // same colors as the story

// ---------- Page elements ----------
const canvas = document.querySelector("#field");
const messageEl = document.querySelector("#message");
const infoEl = document.querySelector("#pitch-info");
const startEl = document.querySelector("#start");
const startBtn = document.querySelector("#start-btn");

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
buildPark(scene);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000);

// Batter's-eye camera: behind and above a right-handed hitter, looking out at the mound
const BAT_CAM = { pos: S(-0.7, -13, 5.8), look: S(0, 30, 1.8) };
const camLook = BAT_CAM.look.clone();
camera.position.copy(BAT_CAM.pos);
camera.lookAt(camLook);

// ---------- Players, bat and ball ----------
const pitcher = buildPitcher();
scene.add(pitcher.root);
const pitcherBase = S(0, MOUND_Y, MOUND_H);              // feet on the rubber
let pitcherOffset = new THREE.Vector3();                 // shifts him so his hand matches the real release point
applyPose(pitcher, setPose, pitcherBase);

const batter = buildBatter();
scene.add(batter.root);
const BATTER_FEET = S(-2.9, 0.4, 0);
batter.root.position.copy(BATTER_FEET);
batter.root.rotation.y = Math.PI / 2;                    // facing the plate
batter.hips.position.y = 3.5 * 6.1 / 6.6 - 0.35;         // slight crouch
batter.torso.rotation.x = 0.3;
for (const [hip, knee, z] of [[batter.rHip, batter.rKnee, -0.25], [batter.lHip, batter.lKnee, 0.25]]) {
  hip.rotation.set(-0.25, 0, z);
  knee.rotation.x = 0.5;
}
const bat = buildBat();
scene.add(bat);

const ball = buildBall(BALL_R);
scene.add(ball);

// A faint trail behind the pitch so a 100 mph fastball is easier to follow
const TRAIL = 14;
const trailGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Array(TRAIL * 3).fill(0), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
trail.frustumCulled = false;
scene.add(trail);
const trailPts = [];

// ---------- Strike zone, pitch marks and aiming circle (on the front edge of the plate) ----------
// Everything here is drawn on top of the batter (depthTest off) so it's never hidden.
const overlay = new THREE.Group();          // shown only in the batter's view
scene.add(overlay);
const flatMat = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthTest: false });
let zone = { top: 3.3, bot: 1.6 };

// Strike zone: a white frame with a faint 3×3 grid (Statcast's zones 1–9)
function buildZone() {
  const frame = new THREE.Group();
  const bar = (x0, z0, x1, z1, w, opacity) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len + w, w), flatMat(0xffffff, opacity));
    m.position.copy(S((x0 + x1) / 2, FRONT_OF_PLATE, (z0 + z1) / 2));
    m.rotation.z = Math.atan2(z1 - z0, x1 - x0);
    m.renderOrder = 10;
    frame.add(m);
  };
  const { top, bot } = zone, h = (top - bot) / 3, w = (2 * ZONE_HALF) / 3;
  for (const i of [1, 2]) {
    bar(-ZONE_HALF + i * w, bot, -ZONE_HALF + i * w, top, 0.015, 0.3);   // grid lines
    bar(-ZONE_HALF, bot + i * h, ZONE_HALF, bot + i * h, 0.015, 0.3);
  }
  bar(-ZONE_HALF, bot, ZONE_HALF, bot, 0.04, 0.9);                      // outer frame
  bar(-ZONE_HALF, top, ZONE_HALF, top, 0.04, 0.9);
  bar(-ZONE_HALF, bot, -ZONE_HALF, top, 0.04, 0.9);
  bar(ZONE_HALF, bot, ZONE_HALF, top, 0.04, 0.9);
  overlay.add(frame);
}

// Pitch marks: where each pitch crossed the plate, in its pitch-type color, numbered
// within the current at-bat. Marks from earlier at-bats stay but fade back.
const pitchMarks = [];
function numberSprite(n) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.22, 0.22, 1);
  sprite.renderOrder = 14;
  return sprite;
}
function addPitchMark(p, n) {
  const mark = new THREE.Group();
  mark.position.copy(S(p.plate_x, FRONT_OF_PLATE - 0.03, p.plate_z));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.18, 32), flatMat(0xffffff));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), flatMat(color(p.pitch_name)));
  ring.renderOrder = 12; dot.renderOrder = 13;
  mark.add(ring, dot, numberSprite(n));
  overlay.add(mark);
  pitchMarks.push(mark);
  if (pitchMarks.length > 40) overlay.remove(pitchMarks.shift());   // keep the last 40 pitches
}
function fadeOldMarks() {
  for (const mark of pitchMarks) {
    mark.children.forEach(m => { m.material.opacity = 0.22; });
    mark.children[2].visible = false;            // hide the old at-bat's numbers
  }
}

const reticle = new THREE.Group();
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.85, depthTest: false });
reticle.add(new THREE.Mesh(new THREE.RingGeometry(SWEET_RADIUS - 0.05, SWEET_RADIUS, 48), ringMat));
reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), ringMat));
reticle.children.forEach(m => { m.renderOrder = 15; });
overlay.add(reticle);

const aim = { x: 0, z: 2.5 };          // where the player is aiming (Statcast x and height)
const aimTarget = { x: 0, z: 2.5 };

// Landing spots of batted balls (gold = home run, white = in play, gray = foul)
const markers = [];
function addMarker(x, y, hex) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.2, 24), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(S(x, y, 0.15));
  scene.add(m);
  markers.push(m);
  if (markers.length > 12) scene.remove(markers.shift());
}

// ---------- Game state ----------
const game = {
  balls: 0, strikes: 0, hits: 0, homers: 0, ks: 0, walks: 0, longest: 0,
  abPitch: 0,              // pitches so far in this at-bat (numbers the pitch marks)
  abOver: false,           // the last pitch ended the at-bat
  phase: "start",          // start → pitch → (hit) → result → pitch …
  clock: 0,                // seconds since this phase began
  pitch: null,             // the real pitch being thrown
  swing: null,             // { start: clock time, at: seconds after release }
  verdict: null,           // judgeSwing() result
  hit: null                // simulated batted ball
};
let pool = [];

function choosePitch() {
  // A real pitch he threw in the same count (all pitches if there are fewer than 10)
  const same = pool.filter(d => d.balls === game.balls && d.strikes === game.strikes);
  const list = same.length >= 10 ? same : pool;
  return preparePitch(list[Math.floor(Math.random() * list.length)]);
}

function startPitch() {
  if (game.abOver) { fadeOldMarks(); game.abPitch = 0; game.abOver = false; }   // new at-bat
  game.pitch = choosePitch();
  game.swing = null;
  game.verdict = null;
  game.hit = null;
  game.phase = "pitch";
  game.clock = 0;
  trailPts.length = 0;
  hideMessage();

  // Shift the pitcher so his hand at release lands exactly on this pitch's real release point
  pitcherOffset.set(0, 0, 0);
  applyPose(pitcher, releasePose, pitcherBase);
  pitcher.root.updateMatrixWorld(true);
  const hand = pitcher.rHand.getWorldPosition(new THREE.Vector3());
  const r = pitchAt(game.pitch, 0);
  pitcherOffset.copy(S(r.x, r.y, r.z)).sub(hand);
  pitcherOffset.y = Math.max(-0.6, Math.min(0.6, pitcherOffset.y));
}

function swing() {
  if (game.phase !== "pitch" || game.swing) return;       // one swing per pitch
  game.swing = { start: game.clock, at: game.clock - RELEASE_AT };
  game.verdict = judgeSwing(game.pitch, game.swing.at, { ...aim });
}

// The ball has reached the plate (and the swing, if any, has gotten there too)
function resolvePitch() {
  const p = game.pitch, v = game.verdict;
  if (v?.hit) {
    game.hit = simulateHit({ x: p.plate_x, y: FRONT_OF_PLATE, z: p.plate_z }, v);
    game.phase = "hit";
    game.clock = 0;
    return;
  }
  if (v) return finish("strike", "Swing and miss", v.reason);
  const inZone = Math.abs(p.plate_x) <= ZONE_HALF && p.plate_z >= p.sz_bot && p.plate_z <= p.sz_top;
  if (inZone) finish("strike", "Called strike", "it caught the zone");
  else finish("ball", "Ball", "outside the zone");
}

// The batted ball has finished its flight
function resolveHit() {
  const { kind, landing, hrDistance } = game.hit, v = game.verdict;
  const contact = `${Math.round(v.ev)} mph off the bat, ${Math.round(v.la)}° launch`;
  if (kind === "hr") {
    const dist = Math.round(hrDistance);
    game.longest = Math.max(game.longest, dist);
    const end = game.hit.path.at(-1);
    addMarker(end.x, end.y, 0xffc52f);
    finish("hr", `HOME RUN · ${dist} ft`, contact);
  } else if (kind === "foul" || !landing) {
    if (landing) addMarker(landing.x, landing.y, 0x9a9a94);
    finish("foul", "Foul ball", contact);
  } else {
    addMarker(landing.x, landing.y, 0xffffff);
    finish("inplay", `${battedType(v.la)} · ${Math.round(landing.dist)} ft`, `to ${directionWord(landing.angle)} · ${contact}`);
  }
}

// Update the count and stats, show the result, then pause before the next pitch
function finish(kind, text, detail) {
  let headline = text;
  game.abPitch++;
  addPitchMark(game.pitch, game.abPitch);          // show where this pitch crossed the plate
  if (kind === "hr" || kind === "inplay") {
    game.hits++;
    if (kind === "hr") game.homers++;
    resetCount();
  } else if (kind === "ball") {
    game.balls++;
    if (game.balls === 4) { game.walks++; headline = "Walk"; resetCount(); }
  } else if (kind === "foul") {
    if (game.strikes < 2) game.strikes++;
  } else {
    game.strikes++;
    if (game.strikes === 3) { game.ks++; headline = "Strikeout"; resetCount(); }
  }
  showMessage(headline, detail, kind);
  showPitchInfo(game.pitch);
  updateScoreboard();
  game.phase = "result";
  game.clock = 0;
}

function resetCount() { game.balls = 0; game.strikes = 0; game.abOver = true; }

// ---------- On-screen text ----------
function showMessage(text, detail, kind) {
  messageEl.style.color = { hr: "#ffd60a", inplay: "#7ee2a8", ball: "#7ee2a8", foul: "#f2f0ea" }[kind] ?? "#ff8a80";
  const small = document.createElement("small");
  small.textContent = detail;
  messageEl.replaceChildren(text, small);
  messageEl.classList.add("show");
}
function hideMessage() { messageEl.classList.remove("show"); }

const fmtDate = d3.utcFormat("%b %-d, %Y");
function showPitchInfo(p) {
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = color(p.pitch_name);
  const name = document.createElement("strong");
  name.textContent = `${p.pitch_name}, ${p.release_speed.toFixed(1)} mph`;
  const real = p.description ? p.description.replace(/_/g, " ") : "unknown";
  infoEl.replaceChildren(swatch, name,
    ` · a real ${p.balls}-${p.strikes} pitch from ${fmtDate(p.game_date)}, `,
    `${Math.round(p.flightTime * 1000)} ms from his hand to the plate. In the real game: ${real}.`);
}

function updateScoreboard() {
  const lights = (sel, n, total, cls) => document.querySelector(sel).replaceChildren(...d3.range(total).map(i => {
    const s = document.createElement("span");
    s.className = `light ${cls}${i < n ? " on" : ""}`;
    return s;
  }));
  lights("#balls", game.balls, 3, "ball");
  lights("#strikes", game.strikes, 2, "strike");
  document.querySelector("#stat-hits").textContent = game.hits;
  document.querySelector("#stat-hr").textContent = game.homers;
  document.querySelector("#stat-k").textContent = game.ks;
  document.querySelector("#stat-bb").textContent = game.walks;
  document.querySelector("#stat-long").textContent = game.longest ? `${game.longest} ft` : "–";
}

// ---------- Animation helpers ----------
const v3 = (p) => S(p.x, p.y, p.z);
const ease = (k, dt) => 1 - Math.exp(-k * dt);      // smooth, frame-rate independent blending

// Where the batted ball is at time t (path is sampled every 1/120 s)
function hitAt(t) {
  const path = game.hit.path;
  let i = Math.min(path.length - 1, Math.max(1, Math.floor(t * 120)));
  while (i < path.length - 1 && path[i].t < t) i++;
  while (i > 1 && path[i - 1].t > t) i--;
  const a = path[i - 1], b = path[i], w = Math.max(0, Math.min(1, (t - a.t) / ((b.t - a.t) || 1)));
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
}

// Bat: handle in the hands, pointing up over the shoulder at rest, then sweeping level
// through the aim point. At contact the sweet spot (2.25 ft up the bat) is at the aim point.
const IDLE_HANDS = S(-2.35, 0.1, 3.9);
const IDLE_DIR = S(-0.25, -0.45, 0.86).normalize();
const UP = new THREE.Vector3(0, 1, 0);
function updateBat() {
  const sw = game.swing ? game.clock - game.swing.start : null;
  const contactHands = S(aim.x - 2.2, FRONT_OF_PLATE + 0.3, Math.max(2.2, Math.min(4.3, aim.z + 0.35)));
  const toAim = S(aim.x, FRONT_OF_PLATE, aim.z).sub(contactHands).normalize();
  let hands = IDLE_HANDS, dir = IDLE_DIR, twist = 0;
  if (sw !== null && sw < SWING_TIME + 0.6) {
    const s = Math.min(sw, SWING_TIME);
    // Angle around the vertical: -120° (bat back toward the catcher) → 0° at contact → +150° finish
    const phi = s < CONTACT_DELAY
      ? -120 * (1 - (s / CONTACT_DELAY) ** 1.6)
      : 150 * Math.min(1, (s - CONTACT_DELAY) / (SWING_TIME - CONTACT_DELAY)) ** 0.7;
    const swept = toAim.clone().applyAxisAngle(UP, phi * Math.PI / 180);
    const w = Math.min(1, s / (CONTACT_DELAY * 0.4));   // quickly bring the bat from the shoulder
    hands = IDLE_HANDS.clone().lerp(contactHands, w);
    dir = IDLE_DIR.clone().lerp(swept, w).normalize();
    twist = Math.min(1, s / SWING_TIME);
  }
  bat.position.copy(hands);
  bat.quaternion.setFromUnitVectors(UP, dir);

  // Batter turns his hips and shoulders with the swing; arms reach to the bat handle
  batter.hips.rotation.y = 0.5 * twist;
  batter.torso.rotation.y = 0.8 * twist;
  batter.root.updateMatrixWorld(true);
  for (const [sh, target] of [[batter.lSh, hands], [batter.rSh, hands.clone().addScaledVector(dir, 0.3)]]) {
    const from = sh.getWorldPosition(new THREE.Vector3());
    const local = target.clone().sub(from).applyQuaternion(sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local.normalize());
  }
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  game.clock += dt;
  const p = game.pitch;

  // Aiming circle glides toward the pointer
  aim.x += (aimTarget.x - aim.x) * ease(30, dt);
  aim.z += (aimTarget.z - aim.z) * ease(30, dt);
  reticle.position.copy(S(aim.x, FRONT_OF_PLATE - 0.05, aim.z));

  // Pitcher: deliver the pitch, then ease back to the set position while the result shows
  let pose = setPose;
  if (game.phase === "pitch" || game.phase === "hit") pose = deliveryPose(game.phase === "hit" ? 1 : game.clock / WINDUP);
  if (game.phase === "result") pose = mixPose(deliveryPose(1), setPose, Math.min(1, game.clock / 1.2));
  applyPose(pitcher, pose, pitcherBase.clone().add(pitcherOffset));

  // Ball
  let ballPos = null;
  if (game.phase === "pitch" && p) {
    const e = game.clock - RELEASE_AT;
    if (e < 0) {
      pitcher.root.updateMatrixWorld(true);
      ballPos = pitcher.rHand.getWorldPosition(new THREE.Vector3());   // in his hand
    } else {
      ballPos = v3(pitchAt(p, e));
      trailPts.push(ballPos.clone());
      if (trailPts.length > TRAIL) trailPts.shift();
      // Judge once the ball reaches the plate and the swing (if any) has had time to get there
      const swingReady = !game.swing || game.clock - game.swing.start >= CONTACT_DELAY;
      if (e >= p.flightTime && swingReady) resolvePitch();
      if (pitchAt(p, e).y < -2.5) ballPos = null;                     // in the catcher's glove
    }
  } else if (game.phase === "hit") {
    // Follow it until it stops, or 2.5 s after it first lands (no need to watch a long roll)
    const end = Math.min(game.hit.duration, (game.hit.landing?.t ?? Infinity) + 2.5);
    ballPos = v3(hitAt(Math.min(game.clock, end)));
    trailPts.push(ballPos.clone());
    if (trailPts.length > TRAIL) trailPts.shift();
    if (game.clock > end + 0.4) resolveHit();
  }
  ball.visible = !!ballPos;
  if (ballPos) {
    ball.position.copy(ballPos);
    ball.rotation.x -= dt * 40;                                       // spin
  }
  const tp = trailGeo.attributes.position;
  for (let i = 0; i < TRAIL; i++) {
    const q = trailPts[Math.max(0, trailPts.length - TRAIL + i)] ?? ballPos ?? ball.position;
    tp.setXYZ(i, q.x, q.y, q.z);
  }
  tp.needsUpdate = true;
  trail.visible = ballPos !== null && trailPts.length > 1;

  updateBat();

  // Camera: batter's view, or follow a batted ball like a TV broadcast
  if (game.phase === "hit" && ballPos) {
    const flat = new THREE.Vector3(ballPos.x, 0, ballPos.z);
    const away = flat.length() > 1 ? flat.clone().normalize() : new THREE.Vector3(0, 0, -1);
    // High and behind the ball, looking out toward it (a broadcast-style view)
    camGoal.copy(ballPos).addScaledVector(away, -95).setY(Math.max(45, ballPos.y + 30));
    const camDist = Math.hypot(camGoal.x, camGoal.z);
    if (camDist > 300) { camGoal.x *= 300 / camDist; camGoal.z *= 300 / camDist; }  // never back into the seats
    lookGoal.copy(ballPos);
  } else if (game.phase === "result" && game.hit && game.clock < 1.2) {
    // keep looking at where the ball ended up for a moment
  } else {
    camGoal.copy(BAT_CAM.pos);
    lookGoal.copy(BAT_CAM.look);
  }
  camera.position.lerp(camGoal, ease(game.phase === "hit" ? 2.5 : 3.5, dt));
  camLook.lerp(lookGoal, ease(game.phase === "hit" ? 6 : 4, dt));
  camera.lookAt(camLook);

  // Hide the zone, pitch marks and aiming circle while the camera follows the ball
  overlay.visible = camera.position.distanceTo(BAT_CAM.pos) < 3;
  reticle.visible = game.phase !== "start";

  // Next pitch after the pause
  if (game.phase === "result" && game.clock >= RESULT_PAUSE) startPitch();

  renderer.render(scene, camera);
}

// ---------- Sizing ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // On narrow screens, widen the view so the plate and the pitcher both fit
  camera.fov = w / h < 0.9 ? 58 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ---------- Controls: mouse (or finger) aims, click (or Swing button) swings ----------
const raycaster = new THREE.Raycaster();
const platePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), FRONT_OF_PLATE);  // three.js z = -17/12
const hitPoint = new THREE.Vector3();

function aimAt(event) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(platePlane, hitPoint)) {
    aimTarget.x = Math.max(-1.8, Math.min(1.8, hitPoint.x));
    aimTarget.z = Math.max(0.5, Math.min(4.8, hitPoint.y));
  }
}

function start() {
  if (game.phase !== "start" || !pool.length) return;
  startEl.hidden = true;
  startPitch();
}

canvas.addEventListener("pointermove", aimAt);
canvas.addEventListener("pointerdown", e => {
  aimAt(e);
  if (e.pointerType === "mouse" && e.button === 0) {
    if (game.phase === "start") start(); else swing();
  }
});
window.addEventListener("keydown", e => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (game.phase === "start") start(); else swing();
});
startBtn.addEventListener("click", start);
document.querySelector("#btn-swing").addEventListener("pointerdown", e => {
  e.preventDefault();
  if (game.phase === "start") start(); else swing();
});

// ---------- Start ----------
loadPitches().then(({ all }) => {
  const need = ["vx0", "vy0", "vz0", "ax", "ay", "az", "plate_x", "plate_z", "release_extension", "sz_top", "sz_bot", "release_speed"];
  pool = all.filter(d => PITCH_NAMES.includes(d.pitch_name) && need.every(k => Number.isFinite(d[k])));
  zone = { top: d3.mean(pool, d => d.sz_top), bot: d3.mean(pool, d => d.sz_bot) };
  buildZone();
  document.querySelector("#loading").hidden = true;
  console.log("Game pitches available:", pool.length);
  updateScoreboard();
});

resize();
renderer.setAnimationLoop(frame);
