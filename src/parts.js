import * as THREE from 'three';
import { metal, neon, glassMat, wireMat, dotMat, V, rnd } from './core.js';

/* Фабрики деталей. 25 врагов собираются из этого словаря —
   общие узлы читаются, различаются пропорциями, цветом и «фирменной» деталью. */

/* тень-пятно под наземными, чтобы не парили */
export function groundDisc(r = 1.2, opacity = .35) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity, depthWrite: false
  }));
  m.rotation.x = -Math.PI / 2; m.position.y = .015; m.userData.noShadow = true; m.renderOrder = 2;
  return m;
}

/* гусеница: корпус + катки, возвращает группу с полем roll для анимации */
export function treadSet(len, w, h, bodyCol, accent, parts) {
  const g = new THREE.Group();
  const body = metal(bodyCol, .8, .5);
  for (const s of [-1, 1]) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), body);
    belt.position.set(s * w * .62, h * .5, 0);
    g.add(belt);
    /* катки */
    const n = Math.max(3, Math.round(len / (h * 1.1)));
    const rollers = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(h * .34, h * .34, w * .5, 10), metal(0x161c24, .9, .35));
      r.rotation.z = Math.PI / 2;
      r.position.set(s * w * .62, h * .5, (i / (n - 1) - .5) * len * .84);
      rollers.add(r);
    }
    g.add(rollers);
    parts.rollers.push(rollers);
    /* гребни */
    for (let i = 0; i < Math.round(len / .28); i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w * .58, h * .12, .07), metal(0x11161c, .8, .6));
      t.position.set(s * w * .62, h * .04, (i / (Math.round(len / .28) - 1) - .5) * len);
      g.add(t);
    }
    /* неоновая полоса — читаемость в темноте */
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.04, .05, len * .92), neon(accent, 1.4));
    strip.position.set(s * w * .78, h * .5, 0);
    strip.userData.noShadow = true;
    g.add(strip); parts.pulse.push(strip);
  }
  return g;
}

/* ноги: n пар, каждая анимируется фазовым сдвигом */
export function legs(n, span, h, seg, col, parts, phase = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const idx = Math.floor(i / 2);
    const z = (idx / Math.max(1, n / 2 - 1) - .5) * (n > 2 ? span * .7 : 0);
    const hip = new THREE.Group();
    hip.position.set(side * span * .28, h, z);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(seg, h * .62, seg * .8), metal(col, .8, .45));
    upper.position.y = -h * .3; upper.rotation.z = side * .5; hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -h * .58;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(seg * .7, h * .58, seg * .6), metal(col, .75, .5));
    lower.position.y = -h * .28; knee.add(lower);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(seg * .55, seg * .9, 6), metal(0x121820, .8, .55));
    foot.position.y = -h * .58; foot.rotation.x = Math.PI; knee.add(foot);
    hip.add(knee);
    g.add(hip);
    parts.gait.push({ hip, knee, side, ph: phase + i * 1.7 });
  }
  return g;
}

/* корпус — плиты с фасками, базовый объём */
export function carapace(w, h, d, col, panels = 2) {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal(col, .78, .44));
  g.add(main);
  for (let i = 0; i < panels; i++) {
    const t = i / Math.max(1, panels - 1) - .5;
    const p = new THREE.Mesh(new THREE.BoxGeometry(w * .82, h * .22, d * .06), metal(0x1a212b, .7, .55));
    p.position.set(0, h * .22, d * .51 + t * d * .04);
    p.position.y = h * (.1 + i * .2);
    g.add(p);
  }
  const belly = new THREE.Mesh(new THREE.BoxGeometry(w * .8, h * .3, d * .86), metal(0x141a22, .6, .7));
  belly.position.y = -h * .42; g.add(belly);
  return g;
}

/* реактор — фирменная деталь, пульсирует */
export function reactor(color, r = .3, y = 0) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), neon(color, 3.2));
  core.userData.noShadow = true; g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.3, 0), wireMat(color, .5));
  shell.userData.noShadow = true; g.add(shell);
  const light = new THREE.PointLight(color, 12, 7, 2);
  g.add(light);
  g.position.y = y;
  return { group: g, core, shell, light };
}

/* фронтальный щит */
export function shieldPlate(w, h, col, accent) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, .12), metal(col, .9, .3));
  g.add(p);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.max(w, h) * .5, .035, 6, 6), neon(accent, 2.4));
  rim.position.z = .08; rim.userData.noShadow = true; g.add(rim);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * .9, .07, .07), neon(accent, 3));
  bar.position.z = .1; bar.userData.noShadow = true; g.add(bar);
  return g;
}

/* «глаз» — оптический блок */
export function optic(color, r = .18) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.9, r * 1.2, 10), metal(0x1c242e, .8, .4));
  housing.rotation.x = Math.PI / 2; g.add(housing);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), glassMat(0xffd8e0));
  lens.position.z = r * .5; lens.scale.z = .55; lens.userData.noShadow = true; g.add(lens);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r * .55, 12, 10), neon(color, 4));
  iris.position.z = r * .72; iris.userData.noShadow = true; g.add(iris);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, .022, 6, 20), neon(color, 2.6));
  ring.position.z = r * .5; ring.userData.noShadow = true; g.add(ring);
  return { group: g, iris, lens, ring };
}

/* ротор/винт */
export function rotor(r, col, parts, speed = 14) {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .18, r * .18, r * .2, 8), metal(col, .8, .4));
  g.add(hub);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, .03, r * .28), metal(col, .7, .5));
    b.rotation.y = i / 3 * Math.PI * 2;
    b.rotation.z = .18;
    g.add(b);
  }
  const tip = new THREE.Mesh(new THREE.TorusGeometry(r * .95, .02, 6, 24), neon(0xff5a3c, 2.2));
  tip.rotation.x = Math.PI / 2; tip.userData.noShadow = true; g.add(tip);
  parts.rotors.push({ o: g, s: speed });
  return g;
}

/* клешня */
export function claw(span, col, accent, side) {
  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, span), metal(col, .8, .4));
  arm.position.z = span * .4; g.add(arm);
  const a = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1), metal(col, .8, .4));
  a.position.set(side * .12, .2, span * .8); a.rotation.x = .5; g.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1), metal(col, .8, .4));
  b.position.set(side * .12, -.2, span * .8); b.rotation.x = -.5; g.add(b);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.08, .3, 6), neon(accent, 3));
  tip.position.set(0, 0, span); tip.rotation.x = Math.PI / 2; tip.userData.noShadow = true; g.add(tip);
  return g;
}

/* оружейная ствола */
export function barrels(n, len, spread, col, accent) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? (i / (n - 1) - .5) * spread : 0;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .05, len, 8), metal(col, .9, .28));
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.sin(a) * .18, 0, len * .5);
    b.rotation.z = a;
    g.add(b);
    const tip = new THREE.Mesh(new THREE.TorusGeometry(.06, .018, 6, 12), neon(accent, 2.6));
    tip.position.set(Math.sin(a) * .18, 0, len); tip.userData.noShadow = true; g.add(tip);
  }
  return g;
}

/* рой частиц вокруг объекта */
export function swarmField(count, radius, height, color, size = .1) {
  const pos = new Float32Array(count * 3), seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({ a: rnd(0, 6.28), r: radius * rnd(.4, 1), y: rnd(-height, height), sp: rnd(.5, 2.4), ph: rnd(0, 6.28) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, dotMat(color, size, .9));
  pts.userData.noShadow = true;
  return {
    points: pts,
    tick: t => {
      const a = geo.attributes.position.array;
      seeds.forEach((s, i) => {
        const ang = s.a + t * s.sp;
        a[i * 3] = Math.cos(ang) * s.r;
        a[i * 3 + 1] = s.y + Math.sin(t * 1.6 + s.ph) * .18;
        a[i * 3 + 2] = Math.sin(ang) * s.r;
      });
      geo.attributes.position.needsUpdate = true;
    }
  };
}

/* пульс-цель: набор объектов, мерцающих по синусу */
export function pulseList() { return []; }
