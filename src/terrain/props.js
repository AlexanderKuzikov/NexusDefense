import * as THREE from 'three';
import { makeRng } from './noise.js';
import { BIOME, WORLD, heightAt, biomeAt } from './world.js';

/* Пропсы расставляются по биомам и рисуются через InstancedMesh.
   Дерево = 2 инстанса (ствол + крона), камень = 1, кристалл = 2. */

const rngGlobal = makeRng(4242);

/* ---- модели (единичные, затем тиражируются) ----
   Экспортируются: набор элементов ландшафта переиспользует их же,
   чтобы деталь в галерее и деталь в карте были из одного источника. */
export function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6);
  g.translate(0, 1.1, 0);
  return g;
}
export function coneGeo(h, r) {
  const g = new THREE.ConeGeometry(r, h, 7);
  g.translate(0, h / 2, 0);
  return g;
}
export function crystalGeo() {
  const g = new THREE.ConeGeometry(0.3, 1.6, 5);
  g.translate(0, 0.8, 0);
  return g;
}
export function rockGeo() {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.7, 1.1);
  return g;
}

export const matTrunk = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: .9, metalness: .05, flatShading: true });
export const matLeafNormal = new THREE.MeshStandardMaterial({ color: 0x2a4a2c, roughness: .85, metalness: .05, flatShading: true });
export const matLeafBurnt = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: .95, metalness: .05, flatShading: true, emissive: 0x1a0600, emissiveIntensity: .8 });
export const matRock = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: .8, metalness: .3, flatShading: true });
export const matCrystal = new THREE.MeshStandardMaterial({
  color: 0x2a1f4a, roughness: .15, metalness: .5,
  emissive: 0x7a4ad0, emissiveIntensity: 1.4, flatShading: true
});
export const matEmber = new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: .9 });

const dummy = new THREE.Object3D();

function place(mesh, i, x, y, z, s, ry, tilt) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(tilt || 0, ry, 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

import { makeFireSystem, FIRE_FRAG, SMOKE_FRAG } from './fire.js';

/* расстановка по миру */
export function scatterProps(world, heightTex) {
  const rng = makeRng(9001);
  const half = WORLD / 2;
  const lim = half - 6;

  const counts = { normal: 0, burnt: 0, dead: 0, rock: 0, crystal: 0, deadForest: 0 };
  const MAX = 1400;
  const NORMAL_MAX = 460, BURNT_MAX = 240, ROCK_MAX = 320, CRYSTAL_MAX = 120;

  const normalPos = [], burntPos = [], rockPos = [], crystalPos = [], deadPos = [];

  let guard = 0;
  while (guard++ < 40000) {
    const x = (rng() * 2 - 1) * lim;
    const z = (rng() * 2 - 1) * lim;
    const b = biomeAt(world, x, z);
    const y = heightAt(world, x, z);

    if (b === BIOME.FOREST && normalPos.length < NORMAL_MAX && rng() < 0.5) {
      normalPos.push([x, y, z, rng()]);
    } else if (b === BIOME.ASH && burntPos.length < BURNT_MAX && rng() < 0.4) {
      burntPos.push([x, y, z, rng()]);
    } else if (b === BIOME.ROCK && rockPos.length < ROCK_MAX && rng() < 0.35) {
      rockPos.push([x, y, z, rng()]);
    } else if (b === BIOME.CRYSTAL && crystalPos.length < CRYSTAL_MAX && rng() < 0.5) {
      crystalPos.push([x, y, z, rng()]);
    } else if (b === BIOME.FOREST && rng() < 0.06) {
      deadPos.push([x, y, z, rng()]);
    }
  }

  const group = new THREE.Group();

  /* --- обычный лес: ствол + крона (2 уровня) --- */
  if (normalPos.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo(), matTrunk, normalPos.length);
    const leaves = new THREE.InstancedMesh(coneGeo(2.6, 1.15), matLeafNormal, normalPos.length);
    const leaves2 = new THREE.InstancedMesh(coneGeo(2.0, 0.9), matLeafNormal, normalPos.length);
    normalPos.forEach(([x, y, z, r], i) => {
      const s = 0.7 + r * 0.8;
      const ry = r * 6.28;
      place(trunks, i, x, y, z, s, ry, 0);
      place(leaves, i, x, y + 2.0 * s, z, s, ry + r, 0);
      place(leaves2, i, x, y + 3.1 * s, z, s * 0.9, ry + r * 2, 0);
    });
    trunks.castShadow = leaves.castShadow = leaves2.castShadow = true;
    trunks.receiveShadow = true;
    group.add(trunks, leaves, leaves2);
  }

  /* --- выжженный лес: голый ствол + тлеющие угли --- */
  if (burntPos.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo(), matLeafBurnt, burntPos.length);
    const embers = new THREE.InstancedMesh(crystalGeo(), matEmber, burntPos.length * 2);
    burntPos.forEach(([x, y, z, r], i) => {
      const s = 0.7 + r * 0.7;
      const ry = r * 6.28;
      place(trunks, i, x, y, z, s, ry, 0);
      place(embers, i * 2, x + (r - .5) * .3, y + 2.2 * s, z, 0.5 + r * 0.3, ry, 0.2);
      place(embers, i * 2 + 1, x, y + 3.0 * s, z, 0.4 + r * 0.2, ry + 1, -0.2);
    });
    trunks.castShadow = true;
    group.add(trunks, embers);

    /* огонь и дым: то, что делает лес «горящим», а не просто выжженным.
       burntPos хранит [x, y, z, r] — огню нужен [x, z, rot] и высота
       земли, поэтому отдаём их через yOf. */
    const fireSpots = burntPos.map(([x, , z, r]) => [x, z, r]);
    const yOf = (x, z) => heightAt(world, x, z);
    const fire = makeFireSystem(fireSpots, {
      perTree: 5, base: 0.5, spread: 1.7, size: 1.15, rise: 3.0, yOf,
      intensity: 1.0, additive: true, frag: FIRE_FRAG,
      hot: 0xfff0a0, mid: 0xff6a10, cold: 0x7a1a00
    });
    const smoke = makeFireSystem(fireSpots, {
      perTree: 3, base: 1.8, spread: 1.4, size: 3.4, rise: 8.5, yOf,
      intensity: 0.75, additive: false, frag: SMOKE_FRAG, color: 0x35302b
    });
    if (fire) group.add(fire);
    if (smoke) group.add(smoke);
    group.userData.fireMat = fire && fire.userData.mat;
    group.userData.smokeMat = smoke && smoke.userData.mat;
  }

  /* --- мёртвые стволы (редко, для силуэта) --- */
  if (deadPos.length) {
    const trunks = new THREE.InstancedMesh(trunkGeo(), matLeafBurnt, deadPos.length);
    deadPos.forEach(([x, y, z, r], i) => {
      place(trunks, i, x, y, z, 0.6 + r * 0.5, r * 6.28, (r - .5) * 0.3);
    });
    trunks.castShadow = true;
    group.add(trunks);
  }

  /* --- камни --- */
  if (rockPos.length) {
    const rocks = new THREE.InstancedMesh(rockGeo(), matRock, rockPos.length);
    rockPos.forEach(([x, y, z, r], i) => {
      place(rocks, i, x, y - 0.1, z, 0.5 + r * 1.2, r * 6.28, r * 0.3);
    });
    rocks.castShadow = rocks.receiveShadow = true;
    group.add(rocks);
  }

  /* --- кристаллы (светящиеся) --- */
  if (crystalPos.length) {
    const crystals = new THREE.InstancedMesh(crystalGeo(), matCrystal, crystalPos.length);
    crystalPos.forEach(([x, y, z, r], i) => {
      place(crystals, i, x, y, z, 0.6 + r * 0.9, r * 6.28, (r - .5) * 0.25);
    });
    group.add(crystals);
    /* точечный свет на кристаллы — немного, только самые крупные */
    const big = crystalPos.filter(([, , , r]) => r > 0.75).slice(0, 12);
    big.forEach(([x, y, z]) => {
      const l = new THREE.PointLight(0x7a4ad0, 8, 12, 2);
      l.position.set(x, y + 1, z);
      group.add(l);
    });
  }

  group.userData.crystalMat = matCrystal;
  group.userData.emberMat = matEmber;
  return group;
}

/* ---- бордюрные ленты дороги: светящаяся разметка по краям полотна ---- */
export function buildRoadGlow(path) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < path.flat.length; i += 2) {
      const p = path.flat[i];
      const q = path.flat[Math.min(i + 1, path.flat.length - 1)];
      const dir = new THREE.Vector3().subVectors(q, p).setY(0).normalize();
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
      pts.push(new THREE.Vector3(
        p.x + nrm.x * side * 1.5,
        p.y + 0.24,
        p.z + nrm.z * side * 1.5
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, path.flat.length, 0.09, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x35e0ff, transparent: true, opacity: .85,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const tube = new THREE.Mesh(geo, mat);
    tube.userData.noShadow = true;
    group.add(tube);
  }
  return group;
}
