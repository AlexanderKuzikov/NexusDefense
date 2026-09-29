import * as THREE from 'three';
import { metal, neon, glassMat, wireMat, V, rnd } from './core.js';
import {
  groundDisc, treadSet, legs, carapace, reactor, shieldPlate,
  optic, rotor, claw, barrels, swarmField
} from './parts.js';

const parts = () => ({ rollers: [], gait: [], rotors: [], pulse: [], swarm: [] });

/* сегментный червь: тело из колец, ползёт волной */
const railWorm = () => {
  const A = 0x8cff5a, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.5, .45));
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Group();
    s.position.set(0, .6, 1.5 - i * .62);
    const r = .52 - i * .045;
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), metal(0x2a3a2c, .78, .42));
    body.scale.z = 1.25; body.userData.noShadow = true; s.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.06, .04, 6, 20), neon(A, 2.4));
    ring.rotation.x = Math.PI / 2; ring.userData.noShadow = true; s.add(ring);
    p.pulse.push(ring);
    /* боковые шипы */
    for (const sx of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(.07, .28, 6), metal(0x8aa08a, .9, .3));
      sp.position.set(sx * r, 0, 0); sp.rotation.z = sx * -1.4; s.add(sp);
    }
    root.add(s); segs.push(s);
  }
  /* пасть */
  const head = new THREE.Group(); head.position.set(0, .6, 2.0); root.add(head);
  const maw = new THREE.Mesh(new THREE.ConeGeometry(.5, .9, 8, 1, true), metal(0x3a4a33, .8, .4));
  maw.material = maw.material.clone(); maw.material.side = THREE.DoubleSide;
  maw.rotation.x = Math.PI / 2; maw.userData.noShadow = true; head.add(maw);
  const o = optic(A, .16); o.group.position.set(0, .1, .3); head.add(o.group); p.pulse.push(o.iris);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(.07, .32, 6), metal(0xd0dcc8, .9, .25));
    tooth.position.set(Math.cos(a) * .34, Math.sin(a) * .34, .1);
    tooth.rotation.x = Math.PI / 2; head.add(tooth);
  }
  p.swarm.push({ wave: segs, amp: .28, s: 3.2 });
  return { root, h: 1.4, p };
};

/* десантник: грузовик, сбрасывает десант */
const dropper = () => {
  const A = 0xff9d2e, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.6));
  const body = carapace(1.3, .8, 1.8, 0x3c3328, 3);
  body.position.y = 1.5; root.add(body);
  root.add(treadSet(1.9, .34, .56, 0x2a241c, A, p));
  const o = optic(A, .13); o.group.position.set(0, 1.6, .95); root.add(o.group); p.pulse.push(o.iris);
  /* грузовой отсек с открытыми створками */
  const bay = new THREE.Group(); bay.position.set(0, 2.1, -.3); root.add(bay);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, .6, 1.1), metal(0x2e281f, .8, .5));
  bay.add(box);
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(.5, .6, .08), metal(0x4a4032, .85, .4));
    door.position.set(s * .72, 0, 0); door.rotation.z = s * -.7; bay.add(door);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(.04, .5, 1.0), neon(A, 2.6));
    lip.position.set(s * .52, 0, 0); lip.userData.noShadow = true; bay.add(lip); p.pulse.push(lip);
  }
  /* три десантных кокона */
  for (let i = 0; i < 3; i++) {
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(.13, .3, 4, 10), glassMat(0xffd8a0));
    pod.position.set((i - 1) * .3, .42, 0); pod.userData.noShadow = true; bay.add(pod);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.13, .2, 8), neon(A, 3));
    nose.position.set((i - 1) * .3, .7, 0); nose.userData.noShadow = true; bay.add(nose);
    p.pulse.push(nose);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .8, 8), metal(0x8a97a4, .9, .3));
  mast.position.set(0, 2.8, .3); root.add(mast);
  const ant = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), neon(A, 3.2));
  ant.position.set(0, 3.2, .3); ant.userData.noShadow = true; root.add(ant); p.pulse.push(ant);
  const L = new THREE.PointLight(A, 12, 8, 2); L.position.set(0, 2.2, .6); root.add(L); p.pulse.push(L);
  return { root, h: 3.2, p, dropper: true };
};

/* пиявка: присасывается к башне и пьёт энергию */
const energyLeech = () => {
  const A = 0x00ffa3, p = parts(), root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, .7, 6, 14), glassMat(0x9affd8));
  body.position.y = 1.1; body.rotation.x = .5; body.userData.noShadow = true; root.add(body);
  p.pulse.push(body);
  const core = reactor(A, .16, 1.3); root.add(core.group);
  p.pulse.push(core.core, core.light);
  /* присоска */
  const suck = new THREE.Mesh(new THREE.ConeGeometry(.26, .5, 10, 1, true), metal(0x1e3a30, .7, .5));
  suck.material = suck.material.clone(); suck.material.side = THREE.DoubleSide;
  suck.position.set(0, .72, .34); suck.rotation.x = .9; suck.userData.noShadow = true; root.add(suck);
  const o = optic(A, .11); o.group.position.set(0, 1.36, .2); root.add(o.group); p.pulse.push(o.iris);
  /* три щупальца */
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.05, .02, .9, 6), neon(A, 2.4));
    t.position.set(Math.cos(a) * .35, .5, Math.sin(a) * .35);
    t.rotation.z = Math.cos(a) * .5; t.rotation.x = -Math.sin(a) * .5;
    t.userData.noShadow = true; root.add(t);
    p.swarm.push({ o: t, ax: 'y', s: (i % 2 ? -1 : 1) * 1.2 });
  }
  const field = swarmField(40, 1.0, .7, A, .09);
  field.points.position.y = 1.1; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  return { root, h: 1.8, p, leech: true };
};

/* зеркало: набор уменьшенных копий в решётке */
const mirrorSwarm = () => {
  const A = 0xff5edb, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.5, .4));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshBasicMaterial({
    color: A, transparent: true, opacity: .12, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide
  }));
  shell.position.y = 1.4; shell.userData.noShadow = true; root.add(shell);
  p.pulse.push(shell);
  const o = optic(A, .15); o.group.position.set(0, 1.4, .9); root.add(o.group); p.pulse.push(o.iris);
  /* 7 копий внутри, каждая со своим тактом */
  const copies = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.BoxGeometry(.26, .4, .2), metal(0x5a3a5a, .8, .35));
    c.position.set(Math.cos(a) * .55, 1.4, Math.sin(a) * .55);
    c.lookAt(0, 1.4, 0); c.userData.noShadow = true; root.add(c);
    const e = new THREE.Mesh(new THREE.BoxGeometry(.28, .06, .22), neon(A, 2.6));
    e.position.copy(c.position); e.quaternion.copy(c.quaternion);
    e.userData.noShadow = true; root.add(e);
    copies.push({ mesh: c, edge: e, a, ph: i * .9 });
  }
  p.swarm.push({ copies, s: 1.1 });
  const field = swarmField(50, 1.2, .8, A, .1);
  field.points.position.y = 1.4; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  const L = new THREE.PointLight(A, 18, 10, 2); L.position.y = 1.5; root.add(L); p.pulse.push(L);
  return { root, h: 2.4, p, clones: 7 };
};

/* вестник: элита с кольцевым щитом и реликварией */
const voidHerald = () => {
  const A = 0xc46bff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.6));
  const body = carapace(.9, 1.2, .7, 0x2a1f3a, 4);
  body.position.y = 1.7; root.add(body);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(.32, 0), metal(0x6a4a8a, .7, .25));
  head.position.set(0, 2.5, .1); root.add(head);
  const o = optic(A, .13); o.group.position.set(0, 2.5, .34); root.add(o.group); p.pulse.push(o.iris);
  /* ритуальные кольца */
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(.9 + i * .34, .035, 8, 40), neon(A, 3.2 - i * .4));
    r.rotation.set(i * .9, i * .4, 0); r.position.y = 1.7;
    r.userData.noShadow = true; root.add(r);
    p.swarm.push({ o: r, ax: 'y', s: (i % 2 ? -1 : 1) * (.7 + i * .3) });
  }
  /* реликварий */
  const rel = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 6), metal(0x8a7a5a, .9, .3));
  rel.position.set(0, 2.3, -.5); rel.rotation.x = -.4; root.add(rel);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.18, 0), neon(0xffffff, 4));
  gem.position.set(0, 2.75, -.5); gem.userData.noShadow = true; root.add(gem); p.pulse.push(gem);
  const core = reactor(A, .22, 1.9); core.group.position.z = .38; root.add(core.group);
  p.pulse.push(core.core, core.light);
  root.add(legs(2, .72, 1.2, .14, 0x2a1f3a, p, 0));
  return { root, h: 3.0, p, aegis: 1 };
};

export const ENEMIES_C = [
  { id: 'RAIL WORM', ru: 'Рельсовый червь', tier: 2, role: 'Проползающий', color: 0x8cff5a, build: railWorm,
    stats: { hp: .95, spd: .4, arm: .1, dps: 1.2 },
    desc: 'Сегментированное тело из семи колец с шипами по бокам. Ползёт волной — изгиб переносит его в сторону от маршрута, обтекая препятствия.',
    note: 'Гибкий: переносит 40% урона на соседние сегменты. Точечный огонь малоэффективен.' },

  { id: 'DROPPER', ru: 'Сборочник', tier: 3, role: 'Диверсант', color: 0xff9d2e, build: dropper,
    stats: { hp: .85, spd: .4, arm: .28, dps: .3, dropper: 1 },
    desc: 'Гусеничный грузовик с открытым десантным отсеком. Каждые 6 с сбрасывает кокон, из которого выходит Скакун прямо за линией башен.',
    note: 'Кокон падает = новый юнит за спиной. Держи дистанцию, иначе будет зажат.' },

  { id: 'ENERGY LEECH', ru: 'Энергетическая пиявка', tier: 3, role: 'Паразит', color: 0x00ffa3, build: energyLeech,
    stats: { hp: .45, spd: .8, arm: .12, dps: .3, leech: 1 },
    desc: 'Присасывается к первой доступной башне и тянет энергию: -30% урона, пока жива. Прозрачное тело — теряется на светлом фоне.',
    note: 'Не бьёт. Держит в себе 1 башню мёртвой — снимать в первую очередь.' },

  { id: 'MIRROR SWARM', ru: 'Зеркальный рой', tier: 4, role: 'Репликатор', color: 0xff5edb, build: mirrorSwarm,
    stats: { hp: 1.2, spd: .5, arm: .3, dps: 1.4, clones: 7 },
    desc: 'Сфера с семью уменьшенными копиями внутри. Каждая реагирует на свой такт: урон распределяется между ними, и защита дробится.',
    note: 'Распределяет входящий урон на 7. Убей одним залпом Prism Splitter — за один луч.' },

  { id: 'VOID HERALD', ru: 'Вестник пустоты', tier: 4, role: 'Элита', color: 0xc46bff, build: voidHerald,
    stats: { hp: 2.0, spd: .38, arm: .5, dps: 2.0, aegis: 1 },
    desc: 'Гуманоид с тремя ритуальными кольцами и реликварией в спине. Кольца работают как щит: пока вращаются, первый удар каждые 4 с гасится полностью.',
    note: 'Окно между щитами 3.6 с. Ломай ритм — не бей подряд.' }
];
