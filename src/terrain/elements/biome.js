import * as THREE from 'three';
import { makeRng } from '../noise.js';
import { BIOME } from '../world.js';
import { defineElement, KIND, smoothstep, clamp } from './contract.js';
import { trunkGeo, coneGeo, crystalGeo, rockGeo,
         matTrunk, matLeafNormal, matLeafBurnt, matRock, matCrystal } from '../props.js';
import { makeFireSystem, FIRE_FRAG, SMOKE_FRAG } from '../fire.js';

/* =============================================================
   БИОМ-ПЯТНА
   Почти не меняют рельеф (кроме мелкой неровности) — их работа:
   покрасить биом и насадить декор. Рельеф компоновщик при необходимости
   ставит отдельно (холм, плато), а пятно отвечает за содержание.
   ============================================================= */

/* Лёгкая неровность, чтобы пятно не лежало идеально плоским. */
const bump = (x, z, amp, freq) => Math.sin(x * freq) * Math.cos(z * freq * 0.83) * amp;

/* Общая сборка: слой земли + инстансы пропсов по точкам от props(). */
function patchBody(tpl, p, opts) {
  const grp = new THREE.Group();

  if (opts.ground !== false) {
    const g = new THREE.CircleGeometry(tpl.core, 48);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      pos.setY(k, tpl.heightAt(pos.getX(k), pos.getZ(k), 0, 0, 0, p));
    }
    g.computeVertexNormals();
    grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: opts.groundColor, roughness: 1, metalness: 0, flatShading: true
    })));
  }

  const spots = tpl.props(makeRng(tpl.seed), p);
  if (spots.length) {
    const mk = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const d = new THREE.Object3D();
      list.forEach(([x, z, s, ry, dy], k) => {
        d.position.set(x, tpl.heightAt(x, z, 0, 0, 0, p) + (dy || 0), z);
        d.rotation.set(0, ry, 0);
        d.scale.setScalar(s);
        d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
      });
      im.castShadow = true;
      grp.add(im);
      return im;
    };
    for (const [name, count, color] of opts.layers) {
      const list = spots.filter((_, i) => i % count === 0);
      if (!list.length) continue;
      if (name === 'rock') mk(rockGeo(), matRock, list);
      else if (name === 'crystal') mk(crystalGeo(), matCrystal, list);
      else if (name === 'trunk') {
        mk(trunkGeo(), matTrunk, list);
        /* крона — второй слой, сдвинутая выше и меньше */
        mk(coneGeo(2.6, 1.5), matLeafNormal, list.map(([x, z, s, ry]) => [x, z, s * 0.9, ry, 1.6]));
      } else if (name === 'burnt') {
        mk(trunkGeo(), matLeafBurnt, list);
      }
    }
  }

  /* огонь для горящего леса */
  if (opts.fire) {
    const spots = tpl.props(makeRng(tpl.seed), p);
    const burnt = spots.filter((_, i) => i % opts.layers[0][1] === 0);
    const yOf = (x, z) => tpl.heightAt(x, z, 0, 0, 0, p);
    const fire = makeFireSystem(burnt, {
      perTree: 5, base: 0.5, spread: 1.7, size: 1.15, rise: 3.0, yOf,
      intensity: 1.0, additive: true, frag: FIRE_FRAG,
      hot: 0xfff0a0, mid: 0xff6a10, cold: 0x7a1a00
    });
    const smoke = makeFireSystem(burnt, {
      perTree: 3, base: 1.8, spread: 1.4, size: 3.4, rise: 8.5, yOf,
      intensity: 0.75, additive: false, frag: SMOKE_FRAG, color: 0x35302b
    });
    if (fire) grp.add(fire);
    if (smoke) grp.add(smoke);
    grp.userData.fireMat = fire?.userData.mat;
    grp.userData.smokeMat = smoke?.userData.mat;
  }

  return grp;
}

/* Равномерное рассеивание по кругу с минимальной дистанцией между точками. */
function scatter(rng, n, radius) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const a = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * radius;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (out.some(([ox, oz]) => (ox - x) ** 2 + (oz - z) ** 2 < 1.6)) continue;
    out.push([x, z, 0.75 + rng() * 0.6, rng() * 6.28, 0]);
  }
  return out;
}

/* ---------- ЛЕС ---------- */
export const forest = defineElement({
  id: 'forest', name: 'Лес', kind: KIND.BIOME,
  tags: ['biome', 'cover'],
  radius: 22, core: 16, cost: 2, profile: 'flat',
  note: 'Затрудняет обзор для башен, замедляет наземных врагов.',
  defaults: { density: 26 },
  heightAt: (x, z, base, t, p) => bump(x, z, 0.8, 0.12),
  biomeAt: (x, z) => BIOME.FOREST,
  props: (rng, p) => scatter(rng, p.density, forest.core * 0.94),
  canPlaceAt: ctx => ctx.slope > 0.8
    ? { ok: false, why: 'лес не растёт на отвесе' }
    : { ok: true },
  build: p => patchBody(forest, p, {
    groundColor: 0x2c4a24,
    layers: [['trunk', 1, 0]]
  })
});

/* ---------- ГОРЯЩИЙ ЛЕС ---------- */
export const burningForest = defineElement({
  id: 'burningForest', name: 'Горящий лес', kind: KIND.BIOME,
  tags: ['biome', 'cover', 'hazard', 'fire'],
  radius: 20, core: 14, cost: 4, profile: 'flat',
  note: 'Выжженный лес с огнём. Урон по времени, но и врагам проходит.',
  defaults: { density: 18 },
  heightAt: (x, z, base, t, p) => bump(x, z, 1.1, 0.1),
  biomeAt: () => BIOME.ASH,
  props: (rng, p) => scatter(rng, p.density, burningForest.core * 0.94),
  build: p => patchBody(burningForest, p, {
    groundColor: 0x3a322c,
    layers: [['burnt', 1, 0]],
    fire: true
  })
});

/* ---------- СТЕПЬ ---------- */
export const steppe = defineElement({
  id: 'steppe', name: 'Степь', kind: KIND.BIOME,
  tags: ['biome', 'open'],
  radius: 24, core: 18, cost: 1, profile: 'flat',
  note: 'Открытая ровная земля. Единственное место, где башни видят всё.',
  defaults: { density: 10 },
  heightAt: (x, z, base, t, p) => bump(x, z, 0.5, 0.08),
  biomeAt: () => BIOME.GRASS,
  props: (rng, p) => scatter(rng, p.density, steppe.core * 0.9),
  build: p => patchBody(steppe, p, {
    groundColor: 0x3f5a2a,
    layers: [['rock', 5, 0]]
  })
});

/* ---------- ПЕСЧАНАЯ КОСА ---------- */
export const sandFlat = defineElement({
  id: 'sandFlat', name: 'Песчаная коса', kind: KIND.BIOME,
  tags: ['biome', 'open'],
  radius: 20, core: 15, cost: 1, profile: 'flat',
  note: 'Песок. Быстрое перемещение, нет укрытия.',
  heightAt: (x, z, base, t, p) => bump(x, z, 0.4, 0.16),
  biomeAt: () => BIOME.SAND,
  build: p => patchBody(sandFlat, p, { groundColor: 0x8a7448 })
});

/* ---------- СНЕЖНАЯ ВЕРШИНА ---------- */
export const snowCap = defineElement({
  id: 'snowCap', name: 'Снежная вершина', kind: KIND.BIOME,
  tags: ['biome', 'cold'],
  radius: 18, core: 13, cost: 2, profile: 'flat',
  note: 'Снег и лёд. Замедляет всех, включая башни.',
  heightAt: (x, z, base, t, p) => bump(x, z, 0.9, 0.13),
  biomeAt: () => BIOME.SNOW,
  canPlaceAt: ctx => ctx.h < 6
    ? { ok: false, why: 'снег только в горах' }
    : { ok: true },
  build: p => patchBody(snowCap, p, {
    groundColor: 0xc8d4dc,
    layers: [['rock', 6, 0]]
  })
});

/* ---------- КРИСТАЛЛИЧЕСКОЕ ПОЛЕ ---------- */
export const crystalField = defineElement({
  id: 'crystalField', name: 'Кристаллы', kind: KIND.BIOME,
  tags: ['biome', 'glow', 'hazard'],
  radius: 16, core: 11, cost: 3, profile: 'flat',
  note: 'Светящиеся кристаллы. Усиливают соседние башни.',
  defaults: { density: 14 },
  heightAt: (x, z, base, t, p) => bump(x, z, 1.4, 0.2),
  biomeAt: () => BIOME.CRYSTAL,
  props: (rng, p) => scatter(rng, p.density, crystalField.core * 0.9),
  build: p => {
    const grp = patchBody(crystalField, p, {
      groundColor: 0x3a2f5a,
      layers: [['crystal', 1, 0]]
    });
    /* подсветка снизу — кристаллы должны светить, а не просто быть цветными */
    const l = new THREE.PointLight(0x7a4ad0, 9, 22, 2);
    l.position.y = 1.5;
    grp.add(l);
    return grp;
  }
});

/* ---------- КАМЕННОЕ ПОЛЕ ---------- */
export const scree = defineElement({
  id: 'scree', name: 'Каменное поле', kind: KIND.BIOME,
  tags: ['biome', 'wall'],
  radius: 17, core: 12, cost: 1, profile: 'flat',
  note: 'Россыпь валунов. Непроходимо, нельзя ставить башни.',
  defaults: { density: 20 },
  heightAt: (x, z, base, t, p) => bump(x, z, 1.0, 0.22),
  biomeAt: () => BIOME.ROCK,
  props: (rng, p) => scatter(rng, p.density, scree.core * 0.92),
  build: p => patchBody(scree, p, {
    groundColor: 0x5a6068,
    layers: [['rock', 1, 0]]
  })
});

export const BIOMES = [forest, burningForest, steppe, sandFlat, snowCap, crystalField, scree];
