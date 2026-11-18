// game-physics.js — pitch flight, swing contact and batted-ball flight for game.js.
// All positions use Statcast coordinates in feet: x = toward first base, y = toward the
// pitcher (front of home plate at 17/12), z = height.
import { fenceAt, WALL_H } from "./game-scene.js";

export const FRONT_OF_PLATE = 17 / 12;
const Y_START = 50;                 // Statcast's vx0, vy0, vz0 are measured 50 ft from the plate
const MOUND_Y = 60.5;
const D2R = Math.PI / 180;

// ---------- Pitch flight ----------

// Time when the pitch is at distance y: solve 0.5*ay*t² + vy0*t + (50 - y) = 0
function timeAtY(p, y) {
  const a = 0.5 * p.ay, b = p.vy0, c = Y_START - y;
  return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

// Add a flight path to a real pitch. Statcast gives its velocity and acceleration but not
// its position at 50 ft, so we work backwards from where it crossed the plate.
export function preparePitch(d) {
  const tPlate = timeAtY(d, FRONT_OF_PLATE);
  const tRelease = timeAtY(d, MOUND_Y - d.release_extension);
  return {
    ...d,
    x0: d.plate_x - d.vx0 * tPlate - 0.5 * d.ax * tPlate * tPlate,
    z0: d.plate_z - d.vz0 * tPlate - 0.5 * d.az * tPlate * tPlate,
    tRelease,
    flightTime: tPlate - tRelease          // real seconds from his hand to the plate
  };
}

// Where the pitch is e seconds after release
export function pitchAt(p, e) {
  const t = p.tRelease + e;
  return {
    x: p.x0 + p.vx0 * t + 0.5 * p.ax * t * t,
    y: Y_START + p.vy0 * t + 0.5 * p.ay * t * t,
    z: p.z0 + p.vz0 * t + 0.5 * p.az * t * t
  };
}

// ---------- Swing contact ----------

export const CONTACT_DELAY = 0.12;   // s from click until the bat is over the plate
export const SWEET_RADIUS = 0.55;    // ft: how far the aim can be from the ball and still hit it
const TIMING_WINDOW = 0.12;          // s: how early or late you can be and still hit it

const jitter = size => (Math.random() - 0.5) * 2 * size;

// Compare the swing (time since release + aim point) with where the ball crosses the plate.
// Returns { hit: false, reason } or { hit: true, ev, la, spray } (mph, degrees, degrees).
export function judgeSwing(p, swingAt, aim) {
  const dt = swingAt + CONTACT_DELAY - p.flightTime;        // + = late, − = early
  const dx = aim.x - p.plate_x, dz = aim.z - p.plate_z;     // + = aimed right of / above the ball
  const miss = Math.hypot(dx, dz);
  if (Math.abs(dt) > TIMING_WINDOW) {
    return { hit: false, reason: `${dt < 0 ? "early" : "late"} by ${Math.abs(dt).toFixed(2)} s` };
  }
  if (miss > SWEET_RADIUS) {
    const words = [];
    if (Math.abs(dz) > 0.2) words.push(`${Math.round(Math.abs(dz) * 12)} in ${dz > 0 ? "over" : "under"} it`);
    if (Math.abs(dx) > 0.2) words.push(`${Math.round(Math.abs(dx) * 12)} in ${dx > 0 ? "outside" : "inside"}`);
    return { hit: false, reason: `missed ${words.join(", ") || "it"}` };
  }
  // Contact quality: 1 = perfect timing and aim, 0 = barely touched it
  const q = 0.5 * (1 - Math.abs(dt) / TIMING_WINDOW) + 0.5 * (1 - miss / SWEET_RADIUS);
  const ev = Math.min(118, 52 + 60 * q ** 1.2 + 0.25 * (p.release_speed - 95));
  const la = Math.max(-30, Math.min(75, 14 - (dz / SWEET_RADIUS) * 50 + jitter(4)));
  // Early swings get pulled (to left field for a righty), late ones go the other way.
  // Weak contact can tail off foul.
  let spray = (dt / TIMING_WINDOW) * 55 + dx * 15 + jitter(6);
  if (q < 0.22) spray += Math.sign(spray || 1) * 45;
  return { hit: true, ev, la, spray, q };
}

// ---------- Batted-ball flight ----------

// Drag and backspin lift, tuned so 100 mph at 28° carries about 380 ft and 105 mph at 30°
// about 405 ft, close to what Statcast measures.
const K_DRAG = 0.0020, K_LIFT = 0.0009, GRAVITY = 32.17;

// Step a flying ball forward by dt seconds (gravity + drag + lift)
function flyStep(p, v, lift, dt) {
  const sp = Math.hypot(v.x, v.y, v.z), h = Math.hypot(v.x, v.y) || 1;
  const ax = -K_DRAG * sp * v.x - lift * sp * v.z * (v.x / h);
  const ay = -K_DRAG * sp * v.y - lift * sp * v.z * (v.y / h);
  const az = -GRAVITY - K_DRAG * sp * v.z + lift * sp * h;
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
}

const sprayOf = p => Math.atan2(p.x, p.y) / D2R;

export function directionWord(angle) {
  if (Math.abs(angle) > 45) return angle < 0 ? "the third-base side" : "the first-base side";
  if (angle < -27) return "left field";
  if (angle < -9) return "left-center";
  if (angle <= 9) return "center field";
  if (angle <= 27) return "right-center";
  return "right field";
}

export function battedType(la) {
  if (la < 10) return "Ground ball";
  if (la < 25) return "Line drive";
  if (la < 50) return "Fly ball";
  return "Pop up";
}

// Simulate a batted ball from the plate. Returns the whole path (sampled points with times)
// and what happened: home run, foul ball, or in play (with where it first landed).
export function simulateHit(start, { ev, la, spray }) {
  const speed = ev * 1.46667;               // mph → ft/s
  const p = { ...start };
  const v = {
    x: speed * Math.cos(la * D2R) * Math.sin(spray * D2R),
    y: speed * Math.cos(la * D2R) * Math.cos(spray * D2R),
    z: speed * Math.sin(la * D2R)
  };
  const lift = la > 5 ? K_LIFT * (la > 45 ? 0.6 : 1) : 0;
  const dt = 1 / 240;
  const path = [{ t: 0, ...p }];
  let t = 0, kind = null, landing = null, onGround = false, hrDistance = null;

  while (t < 14) {
    if (!onGround) flyStep(p, v, landing ? 0 : lift, dt);
    else {                                    // rolling: friction slows it down
      const h = Math.hypot(v.x, v.y), slow = Math.max(0, h - 14 * dt);
      if (h > 0) { v.x *= slow / h; v.y *= slow / h; }
      p.x += v.x * dt; p.y += v.y * dt;
    }
    t += dt;
    const r = Math.hypot(p.x, p.y), angle = sprayOf(p);

    // Reached the outfield fence in fair territory: over it = home run, else off the wall
    if (kind !== "hr" && Math.abs(angle) <= 45 && r >= fenceAt(angle)) {
      if (!kind && p.z > WALL_H) {
        kind = "hr";
        hrDistance = carryDistance({ ...p }, { ...v }, lift);
      } else {
        const ux = p.x / r, uy = p.y / r, vr = v.x * ux + v.y * uy;
        if (vr > 0) { v.x -= 1.5 * vr * ux; v.y -= 1.5 * vr * uy; }   // bounce back off the wall, losing speed
        const back = fenceAt(angle) - 0.5;                            // keep it on the field side
        p.x = ux * back; p.y = uy * back;
      }
    }
    // A home run stops when it drops into the seats
    if (kind === "hr") {
      const fence = fenceAt(angle);
      const seats = 12 + Math.max(0, r - fence - 4) * (63 / 126);
      if (r > fence + 4 && p.z <= seats) { path.push({ t, ...p }); break; }
    }
    // Hitting the ground: first touch decides fair or foul, then it bounces and rolls
    if (!onGround && p.z <= 0 && v.z < 0) {
      p.z = 0;
      if (!landing) {
        landing = { x: p.x, y: p.y, t, dist: Math.hypot(p.x, p.y), angle };
        if (!kind) kind = Math.abs(angle) > 45 ? "foul" : "inplay";
      }
      if (Math.abs(v.z) > 5) { v.z = -v.z * 0.4; v.x *= 0.7; v.y *= 0.7; }
      else { v.z = 0; onGround = true; }
    }
    if (path.length < 4000 && Math.round(t * 240) % 2 === 0) path.push({ t, ...p });
    if (onGround && Math.hypot(v.x, v.y) < 1) break;
    if (kind === "foul" && t - landing.t > 0.8) break;   // no need to follow a foul ball far
  }
  path.push({ t, ...p });
  return { path, kind, landing, hrDistance, duration: t };
}

// How far a ball would carry on flat ground (used for a home run's distance, like Statcast)
function carryDistance(p, v, lift) {
  for (let i = 0; i < 4000 && p.z > 0; i++) flyStep(p, v, lift, 1 / 240);
  return Math.hypot(p.x, p.y);
}
