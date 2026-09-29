import * as THREE from 'three';
import { metal, neon, glassMat, wireMat, V, rnd } from './core.js';
import {
  groundDisc, treadSet, legs, carapace, reactor, shieldPlate,
  optic, rotor, claw, barrels, swarmField
} from './parts.js';

const parts = () => ({ rollers: [], gait: [], rotors: [], pulse: [], swarm: [] });

/* ТИР 1 — дешёвые и быстрые */

const mote = () => {
  const A = 0x8cff5a, p = parts(), root = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 0), neon(A, 3.4));
  core.userData.noShadow = true; root.add(core);
  const w1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, 0), wireMat(A, .6));
  w1.userData.noShadow = true; root.add(w1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .02, 6, 24), neon(A, 2.4));
  ring.rotation.x = Math.PI / 2; ring.userData.noShadow = true; root.add(ring);
  p.pulse.push(core, w1);
  p.swarm.push({ o: ring, ax: 'y', s: 2.6 });
  p.swarm.push({ o: w1, ax: 'y', s: -1.4 });
  const L = new THREE.PointLight(A, 8, 5, 2); root.add(L); p.pulse.push(L);
  return { root, h: .8, p };
};

const skitter = () => {
  const A = 0x7ad7ff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(.9));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.3, .5, 4, 10), metal(0x2a3644, .8, .42));
  body.rotation.z = Math.PI / 2; body.position.y = .55; root.add(body);
  const o = optic(A, .13); o.group.position.set(0, .62, .5); o.group.rotation.x = .3; root.add(o.group);
  p.pulse.push(o.iris);
  root.add(legs(4, .8, .5, .09, 0x2a3644, p, 0));
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(.06, .34, 6), metal(0x8a97a4, .9, .3));
    m.position.set(s * .16, .5, .62); m.rotation.x = 1.5; root.add(m);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.07, .5, 6), neon(A, 2.2));
  tail.position.set(0, .6, -.55); tail.rotation.x = -1.9; tail.userData.noShadow = true; root.add(tail);
  return { root, h: 1.1, p };
};

const husk = () => {
  const A = 0xffb44a, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1));
  const torso = carapace(.62, .78, .42, 0x3a3630, 3);
  torso.position.y = 1.15; root.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.3, .26, .3), metal(0x2a2723, .8, .5));
  head.position.set(0, 1.66, .08); root.add(head);
  const o = optic(A, .1); o.group.position.set(0, 1.68, .22); root.add(o.group); p.pulse.push(o.iris);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(.44, .24, .32), metal(0x2a2723, .8, .5));
  pelvis.position.y = .74; root.add(pelvis);
  root.add(legs(2, .56, .72, .13, 0x3a3630, p, 0));
  /* асимметричная рука — силуэт */
  const armR = new THREE.Mesh(new THREE.BoxGeometry(.16, .72, .17), metal(0x4a443c, .8, .45));
  armR.position.set(.4, 1.12, .1); armR.rotation.z = -.15; root.add(armR);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(.26, .24, .26), metal(0x5c544a, .9, .35));
  fist.position.set(.44, .68, .16); root.add(fist);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(.11, .58, .12), metal(0x4a443c, .8, .45));
  armL.position.set(-.4, 1.2, .06); armL.rotation.z = .2; root.add(armL);
  const core = reactor(A, .12, 1.2); core.group.position.z = .24; root.add(core.group);
  p.pulse.push(core.core, core.light);
  return { root, h: 1.9, p };
};

const crawler = () => {
  const A = 0x35e0ff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.1));
  const body = carapace(.7, .26, 1.1, 0x24303c, 3);
  body.position.y = .5; root.add(body);
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 6), metal(0x8a97a4, .9, .3));
    spike.position.set(0, .68, (i - 1) * .34); root.add(spike);
  }
  const o = optic(A, .12); o.group.position.set(0, .52, .62); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(6, 1.1, .48, .08, 0x24303c, p, 0));
  const c1 = claw(.5, 0x3a4756, A, 1), c2 = claw(.5, 0x3a4756, A, -1);
  c1.position.set(.2, .48, .68); c2.position.set(-.2, .48, .68);
  root.add(c1, c2);
  return { root, h: 1.0, p };
};

const wisp = () => {
  const A = 0xc46bff, p = parts(), root = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 14), glassMat(0xd8b0ff));
  core.userData.noShadow = true; core.position.y = 1.5; root.add(core);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 12), neon(A, 3));
  glow.userData.noShadow = true; glow.position.y = 1.5; root.add(glow);
  p.pulse.push(glow);
  p.swarm.push({ o: glow, ax: 'y', s: .8 });
  /* три осколка на орбите */
  const shards = new THREE.Group(); shards.position.y = 1.5; root.add(shards);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0), metal(0x6a5a80, .7, .3));
    const a = i / 3 * Math.PI * 2;
    s.position.set(Math.cos(a) * .55, Math.sin(a * 2) * .2, Math.sin(a) * .55);
    shards.add(s);
  }
  p.rotors.push({ o: shards, s: 1.6 });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.1, .9, 6), wireMat(A, .5));
  tail.position.y = .95; tail.rotation.x = Math.PI; tail.userData.noShadow = true; root.add(tail);
  const L = new THREE.PointLight(A, 10, 6, 2); L.position.y = 1.5; root.add(L); p.pulse.push(L);
  return { root, h: 1.9, p };
};

/* ТИР 2 — стандарт */

const brute = () => {
  const A = 0xff5a3c, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.5));
  const torso = carapace(1.0, 1.0, .62, 0x3c2e2a, 3);
  torso.position.y = 1.5; root.add(torso);
  /* наплечники */
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(.34, 12, 10, 0, 6.3, 0, 1.5), metal(0x4d3a34, .85, .38));
    sh.position.set(s * .6, 1.8, 0); sh.rotation.z = s * .4; root.add(sh);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.1, .34, 6), neon(A, 2.4));
    spike.position.set(s * .72, 2.02, 0); spike.rotation.z = s * -.6; spike.userData.noShadow = true;
    root.add(spike); p.pulse.push(spike);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(.42, .32, .38), metal(0x2e2420, .8, .5));
  head.position.set(0, 2.14, .12); root.add(head);
  const o = optic(A, .13); o.group.position.set(0, 2.15, .3); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(2, .8, 1.02, .18, 0x3c2e2a, p, 0));
  /* два кулака */
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.22, .8, .24), metal(0x4d3a34, .8, .45));
    arm.position.set(s * .72, 1.5, .05); root.add(arm);
    const f = new THREE.Mesh(new THREE.BoxGeometry(.38, .34, .36), metal(0x6a4f44, .9, .32));
    f.position.set(s * .78, .95, .12); root.add(f);
    const k = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .34), neon(A, 2.6));
    k.position.set(s * .78, .95, .32); k.userData.noShadow = true; root.add(k);
  }
  const core = reactor(A, .18, 1.6); core.group.position.z = .36; root.add(core.group);
  p.pulse.push(core.core, core.light);
  return { root, h: 2.5, p };
};

const ravager = () => {
  const A = 0xffe14d, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.3));
  const body = carapace(.72, .58, 1.5, 0x3a3a2c, 3);
  body.position.y = 1.1; root.add(body);
  /* гребень-шипы */
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(.1, .42 - i * .04, 6), metal(0xd8d0a0, .9, .3));
    s.position.set(0, 1.5, (i - 2) * .26); s.rotation.x = -.3; root.add(s);
  }
  const o = optic(A, .14); o.group.position.set(0, 1.12, .82); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(4, 1.0, 1.0, .13, 0x3a3a2c, p, 0));
  /* боковые клинки */
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(.06, .7, .9), metal(0xc8c0a0, .95, .22));
    bl.position.set(s * .52, 1.05, .1); bl.rotation.z = s * .3; bl.rotation.y = s * .2; root.add(bl);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.03, .66, .86), neon(A, 3));
    edge.position.set(s * .58, 1.05, .1); edge.rotation.z = s * .3; edge.rotation.y = s * .2;
    edge.userData.noShadow = true; root.add(edge); p.pulse.push(edge);
  }
  return { root, h: 1.8, p };
};

const turretSpider = () => {
  const A = 0x00ffa3, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.3));
  const body = new THREE.Mesh(new THREE.SphereGeometry(.56, 16, 12), metal(0x25362f, .8, .42));
  body.position.y = 1.15; body.scale.y = .78; root.add(body);
  const o = optic(A, .12); o.group.position.set(0, 1.15, .5); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(6, 1.1, 1.0, .09, 0x25362f, p, 0));
  /* турель сверху */
  const turret = new THREE.Group(); turret.position.y = 1.62; root.add(turret);
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, .18, 10), metal(0x1e2c26, .8, .45));
  turret.add(mount);
  const gun = barrels(2, .8, .34, 0x3c4f45, A);
  gun.position.y = .16; turret.add(gun);
  p.rotors.push({ o: turret, s: .5, mode: 'yaw' });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10, 0, 6.3, 0, 1.4), metal(0x8a9a92, .7, .3));
  dome.position.y = .1; turret.add(dome);
  return { root, h: 2.0, p };
};

const hopper = () => {
  const A = 0xff8a3c, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1));
  const body = carapace(.66, .5, .66, 0x3d3026, 2);
  body.position.y = 1.25; root.add(body);
  const o = optic(A, .14); o.group.position.set(0, 1.3, .36); root.add(o.group); p.pulse.push(o.iris);
  /* пружинные ноги */
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * .3, 1.0, -.05); root.add(hip);
    const th = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .62, 8), metal(0x8a97a4, .9, .28));
    th.position.y = -.31; th.rotation.z = s * .35; hip.add(th);
    const knee = new THREE.Group(); knee.position.set(s * .2, -.62, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(.06, .09, .5, 8), metal(0x6a757f, .9, .3));
    shin.position.y = -.25; shin.rotation.z = -s * .4; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(.13, .3, 6), metal(0x1a2028, .8, .5));
    foot.position.y = -.55; foot.rotation.x = Math.PI; knee.add(foot);
    hip.add(knee);
    p.gait.push({ hip, knee, side: s, ph: s > 0 ? 0 : Math.PI, spring: true });
  }
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 6), neon(A, 3));
  dorsal.position.set(0, 1.62, -.12); dorsal.rotation.x = -.5; dorsal.userData.noShadow = true;
  root.add(dorsal); p.pulse.push(dorsal);
  return { root, h: 1.8, p };
};

const ripper = () => {
  const A = 0xff2e6a, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.1));
  const body = carapace(.6, .42, 1.3, 0x3a2028, 2);
  body.position.y = .95; root.add(body);
  const o = optic(A, .12); o.group.position.set(0, .98, .7); root.add(o.group); p.pulse.push(o.iris);
  /* два клинка вдоль корпуса */
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(.05, .5, 1.1), metal(0xd0b0b8, .95, .2));
    bl.position.set(s * .42, .98, .1); bl.rotation.z = s * .18; root.add(bl);
    const ed = new THREE.Mesh(new THREE.BoxGeometry(.025, .46, 1.06), neon(A, 3.2));
    ed.position.set(s * .46, .98, .1); ed.rotation.z = s * .18; ed.userData.noShadow = true;
    root.add(ed); p.pulse.push(ed);
  }
  root.add(legs(2, .7, .82, .11, 0x3a2028, p, 0));
  /* сопло */
  const th = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .3, 8), metal(0x4a3038, .8, .4));
  th.position.set(0, 1.1, -.75); th.rotation.x = .4; root.add(th);
  const fl = new THREE.Mesh(new THREE.ConeGeometry(.14, .5, 8), neon(0xffb0c0, 3.4));
  fl.position.set(0, 1.16, -1.02); fl.rotation.x = -Math.PI / 2 + .4; fl.userData.noShadow = true;
  root.add(fl); p.pulse.push(fl);
  return { root, h: 1.6, p };
};

/* ТИР 3 — тяжёлые */

const siegeLobber = () => {
  const A = 0xff9d2e, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.6));
  const chassis = carapace(1.2, .5, 1.9, 0x3c3328, 3);
  chassis.position.y = .72; root.add(chassis);
  root.add(treadSet(2.0, .3, .5, 0x2a241c, A, p));
  /* башня */
  const turret = new THREE.Group(); turret.position.y = 1.1; root.add(turret);
  const house = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, 1.0), metal(0x4a4034, .8, .42));
  house.position.y = .2; turret.add(house);
  /* длинная пушка */
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 2.2, 10), metal(0x3a342c, .9, .3));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .26, 1.3); turret.add(barrel);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(.2, .04, 6, 16), metal(0x6a5c48, .9, .32));
    b.position.set(0, .26, .7 + i * .45); turret.add(b);
  }
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(.17, .045, 8, 18), neon(A, 3.2));
  muzzle.position.set(0, .26, 2.4); muzzle.userData.noShadow = true; turret.add(muzzle);
  p.pulse.push(muzzle);
  p.rotors.push({ o: turret, s: .35, mode: 'yaw' });
  const ammo = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .5), metal(0x5c5244, .85, .38));
  ammo.position.set(0, .5, -.4); turret.add(ammo);
  const L = new THREE.PointLight(A, 10, 6, 2); L.position.set(0, .4, 2.2); turret.add(L); p.pulse.push(L);
  return { root, h: 2.0, p, muzzle: V(0, 1.36, 2.4) };
};

const shielder = () => {
  const A = 0x35e0ff, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.4));
  const body = carapace(.9, 1.0, .6, 0x2a3a48, 3);
  body.position.y = 1.4; root.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.36, .3, .34), metal(0x1e2c38, .8, .5));
  head.position.set(0, 2.0, .1); root.add(head);
  const o = optic(A, .11); o.group.position.set(0, 2.0, .26); root.add(o.group); p.pulse.push(o.iris);
  root.add(legs(2, .7, .96, .16, 0x2a3a48, p, 0));
  /* огромный фронтальный щит */
  const sh = shieldPlate(1.5, 1.9, 0x35485a, A);
  sh.position.set(0, 1.35, .72); sh.rotation.y = Math.PI / 2;
  root.add(sh);
  const back = new THREE.Mesh(new THREE.BoxGeometry(.7, .8, .2), metal(0x243440, .8, .45));
  back.position.set(0, 1.4, -.38); root.add(back);
  const core = reactor(A, .15, 1.5); core.group.position.z = -.3; root.add(core.group);
  p.pulse.push(core.core, core.light);
  return { root, h: 2.3, p, armored: true };
};

const swarmQueen = () => {
  const A = 0x8cff5a, p = parts(), root = new THREE.Group();
  root.add(groundDisc(1.7));
  const body = new THREE.Mesh(new THREE.SphereGeometry(.95, 18, 14), metal(0x2a3a2c, .75, .5));
  body.position.y = 1.5; body.scale.set(1, .86, 1.1); root.add(body);
  const o = optic(A, .16); o.group.position.set(0, 1.62, .9); root.add(o.group); p.pulse.push(o.iris);
  /* коконы */
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const sac = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .4, 4, 10), glassMat(0xc0ffb0));
    sac.position.set(Math.cos(a) * .85, 1.3 + (i % 2) * .45, Math.sin(a) * .85);
    sac.userData.noShadow = true; root.add(sac);
  }
  root.add(legs(6, 1.3, 1.1, .12, 0x2a3a2c, p, 0));
  const crown = new THREE.Mesh(new THREE.TorusGeometry(.7, .05, 6, 24), neon(A, 3));
  crown.rotation.x = Math.PI / 2; crown.position.y = 2.3; crown.userData.noShadow = true;
  root.add(crown);
  p.swarm.push({ o: crown, ax: 'y', s: 1.6 });
  const field = swarmField(70, 1.6, 1.0, A, .1);
  field.points.position.y = 1.6; root.add(field.points);
  p.swarm.push({ tick: field.tick });
  const L = new THREE.PointLight(A, 16, 9, 2); L.position.y = 1.7; root.add(L); p.pulse.push(L);
  return { root, h: 2.6, p, spawner: true };
};

export const ENEMIES_A = [
  { id: 'MOTE', ru: 'Пылинка', tier: 1, role: 'Рой', color: 0x8cff5a, build: mote,
    stats: { hp: .04, spd: 1.0, arm: 0, dps: .1 },
    desc: 'Мельчайшая единица роя. Идёт плотной волной за «маткой», живёт секунды и оставляет после себя зелёный след. Сама по себе беспомощна — опасна только количеством.',
    note: 'Урон падает на 60% за цель. Никогда не ставь одну башню — плоди быстрые.' },

  { id: 'SKITTER', ru: 'Скакун', tier: 1, role: 'Разведка', color: 0x7ad7ff, build: skitter,
    stats: { hp: .1, spd: 1.25, arm: 0, dps: .3 },
    desc: 'Быстрый четырёхногий разведчик с оптическим блоком. Обходит башни по дуге и подсвечивает путь — если видишь двоих, значит впереди колонна.',
    note: 'Помечает цель для вражеских стрелков: +25% их урона по отмеченной.' },

  { id: 'HUSK', ru: 'Обломок', tier: 1, role: 'Пехота', color: 0xffb44a, build: husk,
    stats: { hp: .18, spd: .7, arm: .05, dps: .5 },
    desc: 'Базовая пехотная единица: двуногий, слегка горбатый, с разной длиной рук. Рвёт врук зарук за, ничего необычного не делает — и в этом проблема: их всегда много.',
    note: 'Толпа слабее одного BULWARK. Слабые башни против них бесполезны.' },

  { id: 'CRAWLER', ru: 'Ползун', tier: 1, role: 'Штурмовик', color: 0x35e0ff, build: crawler,
    stats: { hp: .13, spd: .95, arm: .02, dps: .45 },
    desc: 'Приземистый шестиногий с двумя клешнями. Низкий профиль — проскальзывает под башнями, которые бьют только по воздуху.',
    note: 'Профиль ниже 0.6 — игнорирует часть атак, целящихся в корпус.' },

  { id: 'WISP', ru: 'Светляк', tier: 1, role: 'Летающий', color: 0xc46bff, build: wisp,
    stats: { hp: .08, spd: 1.1, arm: 0, dps: .25 },
    desc: 'Парящий шар в пыльном облаке осколков. Наземные башни до него физически не достают — нужен зенитный ствол или призма.',
    note: 'Маневренность высокая: уклоняется от одиночных выстрелов с 20% шансом.' },

  { id: 'BRUTE', ru: 'Громила', tier: 2, role: 'Мясистый', color: 0xff5a3c, build: brute,
    stats: { hp: .55, spd: .5, arm: .2, dps: 1.4 },
    desc: 'Тяжёлый двуногий с наплечниками и двумя кулаками. Медленный, но каждый удар снимает половину прочности башни. Идёт первым в колонне, принимая урон на себя.',
    note: 'Скорость 0.5 — легко тормозится Cryo Vent. Ставь замедление первым.' },

  { id: 'RAVAGER', ru: 'Лютый', tier: 2, role: 'Бегун', color: 0xffe14d, build: ravager,
    stats: { hp: .3, spd: 1.35, arm: .08, dps: .9 },
    desc: 'Четвероногий с боковыми клинками и гребнем на спине. Разгоняется после разворота — дистанцию держит плохо, зато вблизи режет быстро.',
    note: 'Разгон даёт +40% скорости через 3 с без урона. Держи его в замедлении.' },

  { id: 'TURRET SPIDER', ru: 'Паук-турель', tier: 2, role: 'Стрелок', color: 0x00ffa3, build: turretSpider,
    stats: { hp: .28, spd: .6, arm: .12, dps: 1.1 },
    desc: 'Шестиногий с вращающейся башенкой. Держит дистанцию и ведёт огонь по башням, а не по фронту. Приоритетная цель для всего, что бьёт по воздуху.',
    note: 'Разворачивается за 0.4 с. Момент перезарядки — окно для добивания.' },

  { id: 'HOPPER', ru: 'Прыгун', tier: 2, role: 'Прыгач', color: 0xff8a3c, build: hopper,
    stats: { hp: .22, spd: .55, arm: .06, dps: .7, jump: 1 },
    desc: 'Компактный механизм на пружинных ногах. Перепрыгивает через узкие коридоры и отдельные башни, обходя их целиком.',
    note: 'Перепрыгивает препятствие шириной до 2. Разрывает линию обороны из одной башни.' },

  { id: 'RIPPER', ru: 'Рвач', tier: 2, role: 'Ассасин', color: 0xff2e6a, build: ripper,
    stats: { hp: .24, spd: 1.2, arm: .1, dps: 1.6 },
    desc: 'Двуногий бегун с двумя клинками вдоль корпуса и реактивным соплом. Идёт по флангу и рубит башни, отвлекаясь от маршрута.',
    note: 'Вне маршрута не ест урон башен — зато чинит их. Бьть только приоритетно.' },

  { id: 'SIEGE LOBBER', ru: 'Осадолом', tier: 3, role: 'Артиллерия', color: 0xff9d2e, build: siegeLobber,
    stats: { hp: .75, spd: .35, arm: .3, dps: 2.4 },
    desc: 'Гусеничная артплатформа с длинной пушкой. Встаёт на дистанции и ломает башни очередями, пока колонна проходит мимо.',
    note: 'Дальность 18 — вылезает за радиус большинства башен. Ставь контру дальность.' },

  { id: 'SHIELDER', ru: 'Щитоносец', tier: 3, role: 'Танк', color: 0x35e0ff, build: shielder,
    stats: { hp: .9, spd: .3, arm: .55, dps: 1.0, armored: 1 },
    desc: 'Двуногий за цельным фронтальным щитом. Фронт почти неуязвим: урон падает до 15%, пока смотрит в одну сторону.',
    note: 'Сбоку незащищён. Ротация башен, бьющих в бок, снимает его за секунды.' },

  { id: 'SWARM QUEEN', ru: 'Матка роя', tier: 3, role: 'Производитель', color: 0x8cff5a, build: swarmQueen,
    stats: { hp: 1.0, spd: .22, arm: .2, dps: .2, spawner: 1 },
    desc: 'Крупная носительница коконов. Каждые 4 с рождает тройку Пылинок — пока жива, поток не заканчивается.',
    note: 'Убийство матки не останавливает вылупившихся. Приоритет №1 в ранней игре.' }
];
