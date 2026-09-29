import * as THREE from 'three';
import { metal, neon, glassMat, wireMat, V, rnd } from './core.js';
import {
  groundDisc, treadSet, legs, carapace, reactor, shieldPlate,
  optic, rotor, claw, barrels, swarmField
} from './parts.js';

const parts = () => ({ rollers: [], gait: [], rotors: [], pulse: [], swarm: [] });

const lancer = () => {
  const A = 0x7ad7ff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.1));
  const body = carapace(.6, .7, .5, 0x2a3440, 3);
  body.position.y = 1.35; root.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 6), metal(0x3c4a58, .8, .4));
  head.position.set(0, 1.86, .1); head.rotation.x = .3; root.add(head);
  const o = optic(A, .12); o.group.position.set(0, 1.8, .3); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(2, .6, 1.0, .12, 0x2a3440, p, 0));
  /* длинный направляющий ствол */
  const lance = new THREE.Group(); lance.position.set(0, 1.5, .5); root.add(lance);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 2.4, 8), metal(0x8a97a4, .95, .22));
  rod.rotation.x = Math.PI / 2; lance.add(rod);
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.14, .025, 6, 14), neon(A, 2.8));
    r.position.z = .5 + i * .45; r.userData.noShadow = true; lance.add(r); p.pulse.push(r);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.11, .5, 8), neon(A, 4));
  tip.position.z = 1.4; tip.rotation.x = Math.PI / 2; tip.userData.noShadow = true;
  lance.add(tip); p.pulse.push(tip);
  p.rotors.push({ o: lance, s: .4, mode: 'pitch', base: 0 });
  const L = new THREE.PointLight(A, 14, 8, 2); L.position.set(0, 1.5, 1.4); lance.add(L); p.pulse.push(L);
  return { root, h: 2.3, p, muzzle: V(0, 1.5, 1.9) };
};

const plagueCarrier = () => {
  const A = 0x9cff2e, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.5));
  const body = new THREE.Mesh(new THREE.SphereGeometry(.8, 18, 14), metal(0x2c3a24, .75, .5));
  body.position.y = 1.5; body.scale.set(1.1, 1, 1); root.add(body);
  /* три резервуара */
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .5, 4, 12), glassMat(0xd0ff90));
    tank.position.set(Math.cos(a) * .72, 1.5, Math.sin(a) * .72);
    tank.rotation.z = Math.cos(a) * .3; tank.userData.noShadow = true; root.add(tank);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .16, 8), neon(A, 3));
    cap.position.set(Math.cos(a) * .72, 1.95, Math.sin(a) * .72); cap.userData.noShadow = true;
    root.add(cap); p.pulse.push(cap);
  }
  const o = optic(A, .12); o.group.position.set(0, 1.62, .78); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(6, 1.2, 1.1, .1, 0x2c3a24, p, 0));
  const field = swarmField(60, 1.7, 1.2, A, .11);
  field.points.position.y = 1.6; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  const L = new THREE.PointLight(A, 18, 10, 2); L.position.y = 1.7; root.add(L); p.pulse.push(L);
  return { root, h: 2.4, p, aura: 1 };
};

const phaseWarden = () => {
  const A = 0xc46bff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.3, .3));
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(.78, .95, 2.4, 8, 1, true), new THREE.MeshBasicMaterial({
    color: A, transparent: true, opacity: .14, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide
  }));
  shroud.position.y = 1.4; shroud.userData.noShadow = true; root.add(shroud);
  p.pulse.push(shroud);
  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(.34, 1.0, 4, 12), metal(0x2a1f3a, .8, .38));
  inner.position.y = 1.4; root.add(inner);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(.2, 0), metal(0x7a5a9a, .7, .28));
    shard.position.set(Math.cos(a) * .8, 1.4 + (i % 2) * .5, Math.sin(a) * .8);
    shard.userData.noShadow = true; root.add(shard);
    p.swarm.push({ o: shard, ax: 'y', s: (i % 2 ? -1 : 1) * 1.4 });
  }
  const o = optic(A, .14); o.group.position.set(0, 2.0, .2); root.add(o.group); p.pulse.push(o.iris);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.6 + i * .22, .025, 6, 32), neon(A, 3));
    r.rotation.set(i * .6, 0, i * .4); r.position.y = 1.4;
    r.userData.noShadow = true; root.add(r);
    p.swarm.push({ o: r, ax: 'y', s: (i % 2 ? -1 : 1) * (.9 + i * .3) });
  }
  const L = new THREE.PointLight(A, 20, 11, 2); L.position.y = 1.6; root.add(L); p.pulse.push(L);
  return { root, h: 2.8, p, phases: true };
};

const splitter = () => {
  const A = 0xff5edb, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.6));
  const body = carapace(1.1, .8, .9, 0x3a2a3a, 3);
  body.position.y = 1.3; root.add(body);
  const o = optic(A, .14); o.group.position.set(0, 1.5, .55); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(4, 1.1, 1.05, .13, 0x3a2a3a, p, 0));
  /* делится надвое при смерти — визуальный маркер */
  for (const s of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(.42, .7, .8), metal(0x4d3a4d, .8, .4));
    half.position.set(s * .68, 1.3, 0); root.add(half);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(.05, .8, .9), neon(A, 2.6));
    seam.position.set(s * .4, 1.3, 0); seam.userData.noShadow = true; root.add(seam);
    p.pulse.push(seam);
  }
  const core = reactor(A, .22, 1.5); core.group.position.y = .1; root.add(core.group);
  p.pulse.push(core.core, core.light);
  return { root, h: 2.2, p, splits: 2 };
};

const teslaParasite = () => {
  const A = 0xffe14d, p = parts(), root = new THREE.Group();
  root.add(groundDisc(.9, .3));
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), metal(0x4a4430, .8, .35));
  body.position.y = 1.2; root.add(body);
  const core = reactor(A, .18, 1.2); root.add(core.group);
  p.pulse.push(core.core, core.light);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), neon(A, 3.4));
    node.position.set(Math.cos(a) * .7, 1.2 + (i % 2) * .4, Math.sin(a) * .7);
    node.userData.noShadow = true; root.add(node); p.pulse.push(node);
    p.swarm.push({ o: node, ax: 'y', s: (i % 2 ? -1 : 1) * 2.2 });
  }
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.52 + i * .2, .02, 6, 26), neon(A, 3));
    r.rotation.x = Math.PI / 2 + i * .8; r.position.y = 1.2;
    r.userData.noShadow = true; root.add(r);
    p.swarm.push({ o: r, ax: 'y', s: (i % 2 ? -1 : 1) * (1.6 + i * .5) });
  }
  return { root, h: 1.9, p, zapper: 1 };
};

const juggernaut = () => {
  const A = 0xff4a2e, p = parts(), root = new THREE.Group();
  root.add(groundDisc(2.4));
  const hull = carapace(2.0, 1.0, 2.4, 0x3a2a24, 4);
  hull.position.y = 1.7; root.add(hull);
  /* рифлёная броня сверху */
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.9, .16, .22), metal(0x4a362e, .9, .35));
    r.position.set(0, 2.24, (i - 2) * .42); root.add(r);
  }
  /* шесть колёс */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.52, .52, .4, 14), metal(0x2a201c, .9, .42));
      w.rotation.z = Math.PI / 2;
      w.position.set(s * 1.0, .56, (i - 1) * .8); root.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .44, 10), metal(0x6a5a50, .9, .3));
      hub.rotation.z = Math.PI / 2; hub.position.set(s * 1.02, .56, (i - 1) * .8); root.add(hub);
      const rollers = new THREE.Group(); rollers.position.copy(w.position); root.add(rollers);
      const w2 = new THREE.Mesh(new THREE.CylinderGeometry(.52, .52, .4, 14), metal(0x2a201c, .9, .42));
      w2.rotation.z = Math.PI / 2; rollers.add(w2);
      p.rollers.push(rollers);
    }
  }
  /* носовая бронеклин */
  const ram = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 6), metal(0x8a7a6a, .95, .25));
  ram.position.set(0, 1.7, 1.6); ram.rotation.x = Math.PI / 2; root.add(ram);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.3, .6, 6), neon(A, 3.4));
  tip.position.set(0, 1.7, 2.3); tip.rotation.x = Math.PI / 2; tip.userData.noShadow = true;
  root.add(tip); p.pulse.push(tip);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, .7, .9), metal(0x33261f, .8, .4));
  cab.position.set(0, 2.4, .5); root.add(cab);
  const o = optic(A, .16); o.group.position.set(0, 2.4, 1.0); root.add(o.group); p.pulse.push(o.iris);
  const L = new THREE.PointLight(A, 22, 12, 2); L.position.set(0, 2.2, 2.2); root.add(L); p.pulse.push(L);
  return { root, h: 3.0, p, armored: true, heavy: true };
};

const skyCarrier = () => {
  const A = 0x4d7cff, p = parts(), root = new THREE.Group();
  const body = carapace(1.6, .8, 2.6, 0x28344a, 3);
  body.position.y = 2.6; root.add(body);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, .16, .9), metal(0x33415a, .8, .42));
    wing.position.set(s * 1.9, 2.6, -.1); wing.rotation.z = s * -.1; root.add(wing);
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .7), neon(A, 2.8));
    tipL.position.set(s * 3.1, 2.7, -.1); tipL.userData.noShadow = true; root.add(tipL); p.pulse.push(tipL);
    const r1 = rotor(1.0, 0x3a4a66, p, 18);
    r1.position.set(s * 2.2, 2.9, -.1);
    root.add(r1);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.4, 1.0), metal(0x33415a, .8, .4));
  tail.position.set(0, 3.1, -1.5); tail.rotation.x = .3; root.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.12, .8, .7), neon(A, 3));
  fin.position.set(0, 3.7, -1.6); fin.userData.noShadow = true; root.add(fin); p.pulse.push(fin);
  const o = optic(A, .14); o.group.position.set(0, 2.5, 1.35); root.add(o.group); p.pulse.push(o.iris);
  const core = reactor(A, .2, 2.6); core.group.position.set(0, 2.6, -.6); root.add(core.group);
  p.pulse.push(core.core, core.light);
  /* бомбы */
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .6, 8), metal(0x4a5262, .8, .4));
    b.position.set((i - 1) * .5, 2.1, .2); root.add(b);
    const tipB = new THREE.Mesh(new THREE.ConeGeometry(.14, .3, 8), neon(0xff4a3c, 2.6));
    tipB.position.set((i - 1) * .5, 1.78, .2); tipB.rotation.x = Math.PI; tipB.userData.noShadow = true;
    root.add(tipB);
  }
  return { root, h: 3.6, p, flying: true };
};

const chronoSaboteur = () => {
  const A = 0x00ffa3, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.1, .3));
  const body = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .8), metal(0x1e3a30, .8, .4));
  body.position.y = 1.4; body.rotation.y = Math.PI / 4; root.add(body);
  const o = optic(A, .12); o.group.position.set(0, 1.42, .55); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(2, .6, 1.0, .1, 0x1e3a30, p, 0));
  /* три циклона-генератора */
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const c = new THREE.Group(); c.position.set(Math.cos(a) * .75, 1.75, Math.sin(a) * .75);
    c.rotation.z = Math.PI / 2; root.add(c);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .04, 6, 22), neon(A, 3.2));
    c.add(ring);
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .3), metal(0x8ad8c0, .8, .3));
      const a2 = k / 4 * Math.PI * 2;
      t.position.set(Math.cos(a2) * .15, Math.sin(a2) * .15, 0); t.rotation.z = a2;
      c.add(t);
    }
    p.rotors.push({ o: c, s: 1.8, mode: 'z' });
  }
  const L = new THREE.PointLight(A, 16, 9, 2); L.position.y = 1.6; root.add(L); p.pulse.push(L);
  return { root, h: 2.4, p, saboteur: true };
};

const gunship = () => {
  const A = 0xff5a3c, p = parts(), root = new THREE.Group();
  const body = carapace(1.4, 1.0, 3.0, 0x3a2a26, 3);
  body.position.y = 2.4; root.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.4, 8), metal(0x4a3630, .85, .35));
  nose.position.set(0, 2.4, 1.9); nose.rotation.x = Math.PI / 2; root.add(nose);
  for (const s of [-1, 1]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(1.8, .5, .7), metal(0x2e2220, .8, .45));
    stub.position.set(s * 1.1, 2.5, -.2); stub.rotation.z = s * -.15; root.add(stub);
    const r2 = rotor(1.2, 0x4a3a34, p, 16);
    r2.position.set(s * 1.3, 2.9, -.2);
    root.add(r2);
    /* пушка */
    const gun = barrels(3, 1.0, .5, 0x3c2e2a, A);
    gun.position.set(s * .7, 2.0, 1.2); root.add(gun);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.2, .9), metal(0x33251f, .8, .4));
  tail.position.set(0, 2.9, -1.7); tail.rotation.x = .3; root.add(tail);
  const o = optic(A, .16); o.group.position.set(0, 2.5, 1.2); root.add(o.group); p.pulse.push(o.iris);
  const core = reactor(A, .22, 2.4); core.group.position.set(0, 2.7, -.4); root.add(core.group);
  p.pulse.push(core.core, core.light);
  return { root, h: 3.4, p, flying: true, guns: 1 };
};

let bossSeed = 1;
const bossPlasma = () => {
  const A = 0xc46bff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(3));
  /* три сросшихся тела */
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 1), metal(0x2a1f3a, .75, .4));
    s.position.set(Math.cos(a) * .9, 1.9 + (i % 2) * .5, Math.sin(a) * .9);
    s.userData.noShadow = true; root.add(s);
    p.swarm.push({ o: s, ax: 'y', s: (i % 2 ? -1 : 1) * .5 });
  }
  const center = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), glassMat(0xd8a8ff));
  center.position.y = 2.3; center.userData.noShadow = true; root.add(center);
  const core = reactor(A, .5, 2.3); root.add(core.group);
  p.pulse.push(core.core, core.light);
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.7 + i * .3, .06, 8, 44), neon(A, 3));
    r.rotation.set(i * .7, i * .4, i * .2); r.position.y = 2.3;
    r.userData.noShadow = true; root.add(r);
    p.swarm.push({ o: r, ax: 'y', s: (i % 2 ? -1 : 1) * (.4 + i * .18) });
  }
  root.add(legs(6, 1.8, 1.4, .16, 0x2a1f3a, p, 0));
  const field = swarmField(110, 2.6, 1.6, A, .13);
  field.points.position.y = 2.3; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  return { root, h: 3.6, p, boss: 1, aura: 1 };
};

const bossHive = () => {
  const A = 0x8cff5a, p = parts(), root = new THREE.Group();
  root.add(groundDisc(3.2));
  const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 2.0, 6, 16), metal(0x2a3a28, .75, .5));
  thorax.position.y = 2.0; thorax.rotation.x = Math.PI / 2; root.add(thorax);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 8), metal(0x35482f, .78, .45));
  head.position.set(0, 2.1, 2.4); head.rotation.x = Math.PI / 2; root.add(head);
  const o = optic(A, .2); o.group.position.set(0, 2.2, 2.9); root.add(o.group); p.pulse.push(o.iris);
  /* шесть когтей */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const c = claw(1.3, 0x3a4d33, A, s);
      c.position.set(s * 1.0, 2.0, 1.0 - i * 1.1);
      c.rotation.y = (i - 1) * .4 * s;
      root.add(c);
    }
  }
  root.add(legs(6, 2.2, 1.5, .18, 0x2a3a28, p, 0));
  /* яйцевые капсулы */
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const e = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 10), glassMat(0xc0ffb0));
    e.position.set(Math.cos(a) * 1.5, 2.2 + (i % 3) * .4, Math.sin(a) * 1.5 - .3);
    e.userData.noShadow = true; root.add(e);
    p.pulse.push(e);
  }
  const L = new THREE.PointLight(A, 30, 16, 2); L.position.y = 2.4; root.add(L); p.pulse.push(L);
  return { root, h: 3.8, p, boss: 1, spawner: true };
};

const bossWarp = () => {
  const A = 0x4d7cff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(2.6, .3));
  const shroud = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 16, 0, 6.3, 0, 2.1), new THREE.MeshBasicMaterial({
    color: A, transparent: true, opacity: .13, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide
  }));
  shroud.position.y = 2.0; shroud.userData.noShadow = true; root.add(shroud);
  p.pulse.push(shroud);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.55, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x04060e, metalness: .5, roughness: .04 }));
  core.position.y = 2.0; root.add(core);
  const o = optic(A, .2); o.group.position.set(0, 2.0, 1.2); root.add(o.group); p.pulse.push(o.iris);
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * .3, .04, 8, 48), neon(A, 3.2 - i * .3));
    r.rotation.set(i * .8, i * .5, 0); r.position.y = 2.0;
    r.userData.noShadow = true; root.add(r);
    p.swarm.push({ o: r, ax: 'y', s: (i % 2 ? -1 : 1) * (.5 + i * .2) });
  }
  const field = swarmField(90, 2.4, 1.5, A, .12);
  field.points.position.y = 2.0; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  const L = new THREE.PointLight(A, 26, 14, 2); L.position.y = 2.0; root.add(L); p.pulse.push(L);
  return { root, h: 3.4, p, boss: 1, phases: true, warp: true };
};

export const ENEMIES_B = [
  { id: 'LANCER', ru: 'Копейщик', tier: 3, role: 'Снайпер', color: 0x7ad7ff, build: lancer,
    stats: { hp: .4, spd: .5, arm: .18, dps: 2.0, range: 16 },
    desc: 'Тонкая высокая фигура с длинным направляющим стволом. Встаёт на максимальную дистанцию и бьёт башни по одной, игнорируя фронт.',
    note: 'Дальность 16. Плавает между двумя целями — сбить приоритетом, а не мощью.' },

  { id: 'PLAGUE CARRIER', ru: 'Чумной носитель', tier: 3, role: 'Отравитель', color: 0x9cff2e, build: plagueCarrier,
    stats: { hp: .6, spd: .45, arm: .2, dps: .3, aura: 1 },
    desc: 'Шестиногий контейнер с тремя резервуарами. Оставляет за собой облако: все башни в радиусе 4 теряют 40% скорострельности.',
    note: 'Аура следует за ним. Убил — облако рассеивается за 2 с.' },

  { id: 'PHASE WARDEN', ru: 'Хранитель фазы', tier: 3, role: 'Фазовщик', color: 0xc46bff, build: phaseWarden,
    stats: { hp: .8, spd: .55, arm: .3, dps: 1.3, phases: 1 },
    desc: 'Силуэт в коконе из четырёх колец. Половину времени в фазе, половину — материален и бьёт в упор. Переход видим: кольца сжимаются.',
    note: 'Фаза 2 с / 3 с материальна. Бей в момент сжатия колец.' },

  { id: 'SPLITTER', ru: 'Делитель', tier: 3, role: 'Делится', color: 0xff5edb, build: splitter,
    stats: { hp: .7, spd: .5, arm: .22, dps: 1.0, splits: 2 },
    desc: 'Двухсегментный четыриногий. При смерти разваливается на две уменьшенные копии с 35% прочности каждая.',
    note: 'Добивай одним мощным ударом (Pulse Cannon) — иначе получишь двойную проблему.' },

  { id: 'TESLA PARASITE', ru: 'Паразит', tier: 3, role: 'Помеха', color: 0xffe14d, build: teslaParasite,
    stats: { hp: .35, spd: .9, arm: .1, dps: .4, zapper: 1 },
    desc: 'Парящий октаэдр с тремя узлами. Подлетает к башне и глушит её на 4 с: башня стреляет, но вхолостую.',
    note: 'Глушит и лечится о башню. Приоритет высший — иначе сеть встаёт.' },

  { id: 'JUGGERNAUT', ru: 'Джаггернаут', tier: 4, role: 'Тяжёлый танк', color: 0xff4a2e, build: juggernaut,
    stats: { hp: 2.4, spd: .28, arm: .65, dps: 3.0, armored: 1, heavy: 1 },
    desc: 'Шестиколёсная бронированная платформа с рифлёной крышей и носовым бронеклином. Фронтальный урон поглощается на 85%.',
    note: 'Пробитие в бок и сзади. Prism Splitter идеальна — три луча заходят за угол.' },

  { id: 'SKY CARRIER', ru: 'Небесный носитель', tier: 4, role: 'Авиация', color: 0x4d7cff, build: skyCarrier,
    stats: { hp: 1.4, spd: .45, arm: .3, dps: 1.5, flying: 1 },
    desc: 'Двухроторный грузовик с бомбовым отсеком. Облетает башни сверху и сбрасывает бомбы на позиции, откуда их не видно.',
    note: 'Игнорирует наземные башни полностью. Только зенит.' },

  { id: 'CHRONO SABOTEUR', ru: 'Хроно-диверсант', tier: 4, role: 'Диверсант', color: 0x00ffa3, build: chronoSaboteur,
    stats: { hp: .9, spd: .65, arm: .18, dps: .5, saboteur: true },
    desc: 'Двуногий с тремя циклонами-генераторами. Замедляет отдельную башню до 25% за 5 с — ровно настолько, чтобы она пропустила волну.',
    note: 'Чинится после смерти за 6 с. Убивать быстро или оставлять две зенитные.' },

  { id: 'GUNSHIP', ru: 'Боевой вертолёт', tier: 4, role: 'Штурмовик', color: 0xff5a3c, build: gunship,
    stats: { hp: 1.8, spd: .5, arm: .4, dps: 2.6, flying: 1, guns: 1 },
    desc: 'Тяжёлый вертолёт с шестью стволами. Держит дистанцию 12 и выжигает башни, пока колонна проходит.',
    note: 'Хрупкий занос: 20% шанс потерять скорость при резком развороте.' },

  { id: 'BOSS · PLASMA MONSTROSITY', ru: 'Плазменная махина', tier: 5, role: 'Босс', color: 0xc46bff, build: bossPlasma,
    stats: { hp: 8, spd: .18, arm: .4, dps: 3.5, boss: 1, aura: 1 },
    desc: 'Три сросшихся тела вокруг светящегося ядра в четырёх вращающихся кольцах. Аура замедления 50% действует постоянно.',
    note: 'Плазменные жгуты гасят башни в радиусе 3. Нужен контроль, а не только урон.' },

  { id: 'BOSS · HIVE COLOSSUS', ru: 'Колосс улья', tier: 5, role: 'Босс', color: 0x8cff5a, build: bossHive,
    stats: { hp: 10, spd: .15, arm: .5, dps: 2.5, boss: 1, spawner: 1 },
    desc: 'Гигантская матка с шестью когтями и восемью яйцевыми капсулами. Каждые 5 с рождает Скакуна. Пока жива — поток бесконечен.',
    note: 'Когти бьют на 7 — входит в контакт с башнями. Держи дистанцию.' },

  { id: 'BOSS · WARP SOVEREIGN', ru: 'Владыка искажений', tier: 5, role: 'Босс', color: 0x4d7cff, build: bossWarp,
    stats: { hp: 12, spd: .2, arm: .6, dps: 3.0, boss: 1, phases: 1, warp: true },
    desc: 'Чёрное ядро в оболочке из пяти колец. Телепортируется на 12 единиц каждые 8 с и втягивает башни в фазу вместе с собой.',
    note: 'После телепорта 1.5 с уязвим. Все окна в ок, если отслеживаешь кольца.' }
];
