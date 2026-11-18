// game-scene.js — builds the 3D ballpark, the pitcher and the batter for game.js.
// Units are feet. Statcast uses (x = toward first base, y = toward the pitcher, z = up);
// three.js uses y for "up", so S() converts: Statcast (x, y, z) → three.js (x, z, -y).
import * as THREE from "three";

export const S = (x, y, z) => new THREE.Vector3(x, z, -y);
export const MOUND_Y = 60.5;
export const MOUND_H = 0.8;
export const WALL_H = 8;

// Fence distance (ft) for each spray angle (degrees, 0 = straight to center, + = right field).
// Typical MLB dimensions: 330 down the lines, 375 in the gaps, 400 to center.
export const fenceAt = d3.scaleLinear([-45, -22.5, 0, 22.5, 45], [330, 375, 400, 375, 330]).clamp(true);

// ---------- Small helpers ----------

// A texture drawn on a 2D canvas (used for grass stripes, dirt, crowd, ball seams)
function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}

function noise(ctx, w, h, colors, n) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

// A flat shape lying on the ground (points are Statcast [x, y] in feet)
function groundShape(points, material, height) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material);
  mesh.rotation.x = -Math.PI / 2;            // shape's (x, y) → ground (x, -z) = Statcast (x, y)
  mesh.position.y = height;
  mesh.receiveShadow = true;
  return mesh;
}

const circlePts = (cx, cy, r, n = 64) =>
  d3.range(n).map(i => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);

// A strip that follows the outfield fence: for each spray angle, from (distance + d0, height h0)
// to (distance + d1, height h1). Used for the warning track, wall and stands.
function fenceStrip(d0, d1, h0, h1, material, from = -45, to = 45) {
  const pos = [], uv = [], idx = [];
  const angles = d3.range(from, to + 0.01, 1.5);
  angles.forEach((a, i) => {
    const r = fenceAt(a), t = a * Math.PI / 180;
    for (const [d, h, v] of [[d0, h0, 0], [d1, h1, 1]]) {
      const p = S(Math.sin(t) * (r + d), Math.cos(t) * (r + d), h);
      pos.push(p.x, p.y, p.z);
      uv.push(i / 6, v);
    }
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- The ballpark ----------

export function buildPark(scene) {
  // Sky: a big dome with a gradient, plus light fog for depth
  const skyTex = canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2f6db5"); g.addColorStop(0.55, "#8cb8e6"); g.addColorStop(1, "#dbe9f5");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })));
  scene.fog = new THREE.Fog(0xc9dcef, 500, 1600);

  // Lights: soft sky light + a sun that casts shadows on the infield
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x3d5a2a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.position.set(-140, 260, 90);
  sun.target.position.set(0, 0, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 700 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Grass with mowing stripes
  const grassTex = canvasTexture(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#3f8a3a" : "#367d33";
      ctx.fillRect(0, (i * h) / 8, w, h / 8);
    }
    noise(ctx, w, h, ["#2f6f2c", "#4a9645"], 3000);
  }, [60, 60]);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.z = -250;
  grass.receiveShadow = true;
  scene.add(grass);

  const dirtTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#b9875a"; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, ["#a87850", "#c99a6c", "#9c6e48"], 2500);
  }, [12, 12]);
  const dirt = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 });
  const infieldGrass = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 });
  const chalk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

  // Infield: dirt arc around the mound, grass diamond inside it, home-plate circle, mound
  scene.add(groundShape(circlePts(0, MOUND_Y, 95), dirt, 0.02));
  const g = 6;   // gap between the grass and each base (the base paths)
  scene.add(groundShape([[0, g * 1.4], [63.6 - g, 63.6], [0, 127.3 - g * 1.4], [-63.6 + g, 63.6]], infieldGrass, 0.04));
  scene.add(groundShape(circlePts(0, 0, 13), dirt, 0.06));
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 9, MOUND_H, 40), dirt);
  mound.position.copy(S(0, MOUND_Y, MOUND_H / 2));
  mound.receiveShadow = true;
  scene.add(mound);

  // Warning track, outfield wall (with a yellow top line) and the stands
  scene.add(fenceStrip(-15, 0, 0.05, 0.05, dirt));
  const wall = fenceStrip(0, 0, 0, WALL_H, new THREE.MeshStandardMaterial({ color: 0x1d4630, roughness: 0.9, side: THREE.DoubleSide }));
  wall.castShadow = true;
  scene.add(wall);
  scene.add(fenceStrip(0, 0, WALL_H, WALL_H + 0.5, new THREE.MeshStandardMaterial({ color: 0xffc52f, side: THREE.DoubleSide })));
  const crowdTex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#24364f"; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, ["#f2f0ea", "#12284b", "#ffc52f", "#c0392b", "#9aa5b1", "#6b4f3a"], 2600);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);   // rows of seats
  }, [1, 3]);
  scene.add(fenceStrip(4, 130, 12, 75, new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1, side: THREE.DoubleSide }), -60, 60));
  scene.add(fenceStrip(0, 4, WALL_H + 0.5, 12, new THREE.MeshStandardMaterial({ color: 0x24364f, side: THREE.DoubleSide }), -60, 60));

  // Foul lines and foul poles
  for (const side of [-1, 1]) {
    const len = 330;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, len), chalk);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = side * Math.PI / 4;
    const mid = S(side * Math.SQRT1_2 * len / 2, Math.SQRT1_2 * len / 2, 0.08);
    line.position.copy(mid);
    scene.add(line);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 70, 10), new THREE.MeshStandardMaterial({ color: 0xffd400 }));
    pole.position.copy(S(side * Math.SQRT1_2 * 331, Math.SQRT1_2 * 331, 35));
    scene.add(pole);
  }

  // Bases, pitching rubber, home plate and batter's boxes
  for (const [x, y] of [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), chalk);
    base.position.copy(S(x, y, 0.12));
    base.rotation.y = Math.PI / 4;
    base.castShadow = true;
    scene.add(base);
  }
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.5), chalk);
  rubber.position.copy(S(0, MOUND_Y, MOUND_H + 0.02));
  scene.add(rubber);
  scene.add(groundShape([[-0.708, 17 / 12], [0.708, 17 / 12], [0.708, 0.708], [0, 0], [-0.708, 0.708]], chalk, 0.1));
  for (const side of [-1, 1]) {
    const x0 = side * 1.2, x1 = side * 5.2;
    const pts = [[x0, -2.5], [x1, -2.5], [x1, 3.5], [x0, 3.5], [x0, -2.5]].map(([x, y]) => S(x, y, 0.09));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })));
  }
}

// ---------- People ----------

// A capsule that hangs down from its joint (so rotating the joint swings the limb)
function limb(len, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, len - 2 * radius), 6, 12), mat);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  return mesh;
}

// Builds a simple person from capsules. Returns the root group and its joints, so poses can
// rotate joints. Facing +z (three.js) when root.rotation.y = 0. Height in feet.
function buildPerson({ height, jersey, sleeve, pants, socks, skin, cap, capBrim }) {
  const k = height / 6.6;
  const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const J = { root: new THREE.Group() };
  J.hips = new THREE.Group(); J.hips.position.y = 3.5 * k; J.root.add(J.hips);

  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * k, 0.3 * k, 6, 12), m(pants));
  pelvis.rotation.z = Math.PI / 2; pelvis.castShadow = true;
  J.hips.add(pelvis);

  J.torso = new THREE.Group(); J.hips.add(J.torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.46 * k, 1.1 * k, 8, 16), m(jersey));
  chest.position.y = 1.05 * k; chest.scale.set(1.3, 1, 0.8); chest.castShadow = true;
  J.torso.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * k, 0.18 * k, 0.35 * k, 10), m(skin));
  neck.position.y = 2.15 * k; J.torso.add(neck);
  J.head = new THREE.Group(); J.head.position.y = 2.55 * k; J.torso.add(J.head);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36 * k, 20, 14), m(skin));
  head.scale.set(0.9, 1.05, 0.95); head.castShadow = true; J.head.add(head);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.37 * k, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(cap));
  capTop.position.y = 0.05 * k; J.head.add(capTop);
  if (capBrim) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * k, 0.3 * k, 0.04 * k, 16, 1, false, -Math.PI / 2, Math.PI), m(capBrim));
    brim.position.set(0, 0.05 * k, 0.22 * k); J.head.add(brim);
  }

  for (const [side, sx] of [["r", -1], ["l", 1]]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.66 * k, 1.75 * k, 0); J.torso.add(sh);
    sh.add(limb(1.15 * k, 0.16 * k, m(sleeve)));
    const el = new THREE.Group(); el.position.y = -1.15 * k; sh.add(el);
    el.add(limb(1.05 * k, 0.13 * k, m(skin)));
    const hand = new THREE.Group(); hand.position.y = -1.08 * k; el.add(hand);
    J[`${side}Sh`] = sh; J[`${side}El`] = el; J[`${side}Hand`] = hand;

    const hip = new THREE.Group(); hip.position.set(sx * 0.3 * k, 0, 0); J.hips.add(hip);
    hip.add(limb(1.75 * k, 0.22 * k, m(pants)));
    const knee = new THREE.Group(); knee.position.y = -1.75 * k; hip.add(knee);
    knee.add(limb(1.65 * k, 0.17 * k, m(socks)));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32 * k, 0.22 * k, 0.9 * k), m(0x111111));
    foot.position.set(0, -1.68 * k, 0.22 * k); foot.castShadow = true; knee.add(foot);
    J[`${side}Hip`] = hip; J[`${side}Knee`] = knee;
  }
  return J;
}

// Misiorowski (stylized): a tall, lanky right-hander (6'7") in a Brewers-style home uniform.
export function buildPitcher() {
  const J = buildPerson({ height: 6.6, jersey: 0xf4f1e8, sleeve: 0x12284b, pants: 0xf4f1e8,
    socks: 0x12284b, skin: 0xc99a74, cap: 0x12284b, capBrim: 0x12284b });
  // Glove on the left hand, ball hand on the right, gold button on the cap
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshStandardMaterial({ color: 0x5a3519, roughness: 0.6 }));
  glove.scale.set(0.8, 1.1, 0.5); glove.castShadow = true;
  J.lHand.add(glove);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc99a74 }));
  J.rHand.add(hand);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffc52f }));
  button.position.y = 0.43; J.head.add(button);
  return J;
}

// The batter: a generic right-handed hitter in a gray road uniform
export function buildBatter() {
  const J = buildPerson({ height: 6.1, jersey: 0x9b9c98, sleeve: 0x2b2f36, pants: 0x9b9c98,
    socks: 0x2b2f36, skin: 0xb98a66, cap: 0x1a1d22, capBrim: 0x1a1d22 });
  return J;
}

// The bat: a tapered cylinder whose handle sits at the group's origin, barrel along +y
export function buildBat() {
  const group = new THREE.Group();
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.045, 2.8, 16),
    new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.45 }));
  bat.position.y = 1.4;
  bat.castShadow = true;
  group.add(bat);
  return group;
}

// The baseball, with red seams drawn on its texture
export function buildBall(radius) {
  const tex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f7f5ef"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#c8312a"; ctx.lineWidth = 3;
    for (const off of [0, w / 2]) {
      ctx.beginPath();
      for (let x = 0; x <= w / 2; x += 2) ctx.lineTo(off + x, h / 2 + Math.sin((x / (w / 2)) * Math.PI * 2) * h * 0.28);
      ctx.stroke();
    }
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  ball.castShadow = true;
  return ball;
}
