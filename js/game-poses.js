// game-poses.js — the pitcher's delivery as a few key poses, blended over time.
// Each pose sets joint angles (radians) on the person built in game-scene.js.
// The pitcher faces home plate at rotY = 0; rotY = -π/2 is the side-on "set" position
// (glove shoulder toward home), the way a right-hander stands before he throws.

const SET = {
  rotY: -Math.PI / 2, stride: 0, drop: 0, torsoX: 0.05, torsoY: 0,
  rShX: -0.5, rShZ: 0.25, rElX: -1.7, rElZ: 0,
  lShX: -0.5, lShZ: -0.25, lElX: -1.7, lElZ: 0,
  rHipX: 0, rHipZ: -0.08, rKneeX: 0.05, lHipX: 0, lHipZ: 0.08, lKneeX: 0.05
};
const LIFT = { ...SET, torsoX: -0.08, lHipX: -1.5, lKneeX: 1.6, rKneeX: 0.2, drop: 0.1 };
const STRIDE = {
  ...SET, rotY: -1.25, stride: 2.4, drop: 0.55, torsoX: 0.12,
  lHipX: -0.3, lHipZ: 0.85, lKneeX: 0.5, rHipZ: -0.45, rKneeX: 0.55,
  rShX: 0.35, rShZ: -1.5, rElX: 0, rElZ: -1.6,        // throwing arm cocked back
  lShX: -0.2, lShZ: 1.35, lElX: 0, lElZ: 0.2          // glove arm points at home
};
const RELEASE = {
  ...SET, rotY: -0.15, stride: 4.4, drop: 0.95, torsoX: 0.75, torsoY: 0,
  lHipX: -0.95, lHipZ: 0.25, lKneeX: 0.6, rHipX: 0.65, rHipZ: -0.1, rKneeX: 0.95,
  rShX: -2.55, rShZ: -0.35, rElX: 0, rElZ: 0,          // arm up and out front at release
  lShX: -0.6, lShZ: 0.45, lElX: -1.4, lElZ: 0          // glove tucked in
};
const FOLLOW = {
  ...RELEASE, rotY: 0.35, stride: 4.7, drop: 1.0, torsoX: 1.05,
  rShX: -0.75, rShZ: 0.65, rElX: -0.4,                 // arm finishes across his body
  rHipX: -0.25, rKneeX: 1.35, lKneeX: 0.4
};

export const RELEASE_U = 0.8;                          // release happens 80% of the way through
const KEYS = [[0, SET], [0.16, SET], [0.38, LIFT], [0.62, STRIDE], [RELEASE_U, RELEASE], [1, FOLLOW]];

export const releasePose = RELEASE;
export const setPose = SET;

const smooth = t => t * t * (3 - 2 * t);

// Blend two poses (w = 0 → a, w = 1 → b)
export function mixPose(a, b, w) {
  const out = {};
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * w;
  return out;
}

// The pose u of the way through the delivery (0 to 1, held at the finish after 1)
export function deliveryPose(u) {
  if (u >= 1) return FOLLOW;
  const i = KEYS.findIndex(([ku]) => ku > u);
  const [u0, a] = KEYS[i - 1], [u1, b] = KEYS[i];
  return mixPose(a, b, smooth((u - u0) / (u1 - u0)));
}

// Put a pose on a person's joints. base = where his feet are before the stride (three.js).
export function applyPose(J, P, base) {
  J.root.position.set(base.x, base.y, base.z + P.stride);   // stride toward home (+z)
  J.root.rotation.y = P.rotY;
  J.hips.position.y = 3.5 - P.drop;
  J.torso.rotation.set(P.torsoX, P.torsoY, 0);
  J.rSh.rotation.set(P.rShX, 0, P.rShZ);
  J.rEl.rotation.set(P.rElX, 0, P.rElZ);
  J.lSh.rotation.set(P.lShX, 0, P.lShZ);
  J.lEl.rotation.set(P.lElX, 0, P.lElZ);
  J.rHip.rotation.set(P.rHipX, 0, P.rHipZ);
  J.rKnee.rotation.x = P.rKneeX;
  J.lHip.rotation.set(P.lHipX, 0, P.lHipZ);
  J.lKnee.rotation.x = P.lKneeX;
}
