import * as THREE from 'three';
import { makeRng } from '../noise.js';
import { BIOME } from '../world.js';
import { defineElement, KIND, smoothstep, clamp } from './contract.js';
import { rockGeo, matRock } from '../props.js';

/* =============================================================
   РЕЛЬЕФ
   Элементы, которые только двигают высоту. Ничего не красят сами
   (кроме помеченных biome) и не несут жидкость — их работа чисто
   геометрическая.
   ============================================================= */

/* Общая форма для превью: смещённый диск по профилю элемента.
   Геометрия строится из того же heightAt, что и штамп в карту, —
   поэтому деталь в галерее и деталь на карте не могут разойтись. */
function reliefBody(el, p, res = 30) {
  const size = el.core * 2;
  const g = new THREE.PlaneGeometry(size, size, res, res);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    /* base = 0 -> дельта становится абсолютной высотой вершины */
    pos.setY(k, el.heightAt(pos.getX(k), pos.getZ(k), 0, 0, 0, p));
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x4c5a3e, roughness: .95, metalness: .05, flatShading: true
  }));
}

function tinted(el, p, res, color, rough, metal) {
  const m = reliefBody(el, p, res);
  m.material = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: true
  });
  return m;
}

/* мягкий купол: 0 в центре, 1 у края ядра */
const domeT = t => Math.cos(clamp(t, 0, 1) * Math.PI * 0.5);

/* ---------- ХОЛМ ---------- */
export const hill = defineElement({
  id: 'hill', name: 'Холм', kind: KIND.RELIEF, tags: ['relief'],
  radius: 16, core: 11, cost: 1, profile: 'peak',
  note: 'Мягкое возвышение. Базовый элемент рельефа, ставится везде.',
  heightAt: (x, z, base, t) => 6.5 * domeT(t),
  build: p => reliefBody(hill, p)
});

/* ---------- ГРЯДА / ХРЕБЕТ ---------- */
export const ridge = defineElement({
  id: 'ridge', name: 'Гряда', kind: KIND.RELIEF, tags: ['relief', 'long'],
  radius: 26, core: 20, cost: 2, profile: 'peak',
  /* вытянутый след: длина вдоль X в 2.6 раза больше ширины */
  shape: (dx, dz) => Math.hypot(dx * 0.38, dz),
  note: 'Вытянутая гряда. Задаёт направление ландшафта, ставится поперёк пути.',
  heightAt: (x, z, base, t) => 11 * Math.pow(domeT(t), 0.7),
  canPlaceAt: ctx => ctx.slope > 0.5
    ? { ok: false, why: 'слишком полого — гряде нужен уклон' }
    : { ok: true },
  build: p => reliefBody(ridge, p, 36)
});

/* ---------- ПЛАТО ---------- */
export const plateau = defineElement({
  id: 'plateau', name: 'Плато', kind: KIND.RELIEF, tags: ['relief', 'flat'],
  radius: 18, core: 13, cost: 2, profile: 'peak',
  note: 'Плоская вершина с обрывистыми краями. Хорошо под башни.',
  /* ровная вершина, обрыв только на последней трети радиуса.
     Именно 1 - smoothstep: наоборот получилась бы чаша. */
  heightAt: (x, z, base, t) => 9 * (1 - smoothstep(0.55, 0.92, t)),
  canPlaceAt: () => ({ ok: true, flat: true }),
  build: p => reliefBody(plateau, p)
});

/* ---------- КОТЛОВИНА ---------- */
export const basin = defineElement({
  id: 'basin', name: 'Котловина', kind: KIND.RELIEF, tags: ['relief', 'bowl'],
  radius: 17, core: 12, cost: 1, profile: 'bowl',
  note: 'Чаша в рельефе. Обычно требует наполнения — см. озеро или яд.',
  heightAt: (x, z, base, t) => -7 * domeT(t),
  canPlaceAt: ctx => ctx.slope > 0.7
    ? { ok: false, why: 'котловина не ляжет на склон' }
    : { ok: true },
  build: p => reliefBody(basin, p)
});

/* ---------- УСТУП / ОБРЫВ ---------- */
export const cliff = defineElement({
  id: 'cliff', name: 'Уступ', kind: KIND.RELIEF, tags: ['relief', 'cliff'],
  radius: 20, core: 15, cost: 3, profile: 'step',
  note: 'Обрыв с плоским верхом. Разделяет зоны карты, ломает линию обороны.',
  defaults: { rise: 9, dir: 0 },
  /* Уступ — это разрыв ПО НАПРАВЛЕНИЮ, а не радиальная чаша:
     плюс-половина плато, минус-половина низ. Направление задаёт
     компоновщик параметром dir. Переход узкий и гладкий: квантование
     в ступени давало рваный «зубчатый» край. */
  heightAt: (x, z, base, t, p) => {
    const a = p.dir * Math.PI / 2;
    const along = (x * Math.cos(a) - z * Math.sin(a)) / cliff.core;
    return p.rise * smoothstep(-0.12, 0.12, along);
  },
  canPlaceAt: ctx => ctx.h > 8
    ? { ok: false, why: 'уступ ставится на равнине, не на вершине' }
    : { ok: true },
  build: p => reliefBody(cliff, p, 26)
});

/* ---------- СКАЛЬНЫЙ МАССИВ ---------- */
export const crag = defineElement({
  id: 'crag', name: 'Скалы', kind: KIND.RELIEF, tags: ['relief', 'rock', 'biome'],
  radius: 15, core: 10, cost: 2, profile: 'peak',
  note: 'Каменный выход с россыпью валунов. Читается как непроходимая зона.',
  heightAt: (x, z, base, t) => {
    /* рваный верх: чем ближе к краю, тем острее */
    const n = Math.sin(x * 0.55) * Math.cos(z * 0.47) * 0.5 + 0.5;
    return 8.5 * domeT(t) * (0.72 + n * 0.45);
  },
  biomeAt: () => BIOME.ROCK,
  props: rng => {
    const out = [];
    for (let k = 0; k < 14; k++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 9;
      out.push([Math.cos(a) * rad, Math.sin(a) * rad, 0.5 + rng() * 1.4, rng() * 6.28]);
    }
    return out;
  },
  build: p => {
    const grp = new THREE.Group();
    grp.add(tinted(crag, p, 22, 0x5a6068, .85, .15));
    const spots = crag.props(makeRng(crag.seed));
    const rocks = new THREE.InstancedMesh(rockGeo(), matRock, spots.length);
    const d = new THREE.Object3D();
    spots.forEach(([x, z, s, ry], k) => {
      d.position.set(x, crag.heightAt(x, z, 0, 0, 0, p), z);
      d.rotation.set(0, ry, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      rocks.setMatrixAt(k, d.matrix);
    });
    rocks.castShadow = true;
    grp.add(rocks);
    return grp;
  }
});

/* ---------- ДЮНА ---------- */
export const dune = defineElement({
  id: 'dune', name: 'Дюна', kind: KIND.RELIEF, tags: ['relief', 'long', 'biome'],
  radius: 24, core: 17, cost: 1, profile: 'peak',
  shape: (dx, dz) => Math.hypot(dx * 0.5, dz),
  note: 'Пологая песчаная гряда с ветровыми волнами.',
  heightAt: (x, z, base, t) => 4.5 * domeT(t) * (0.85 + Math.sin(x * 0.7 + z * 0.3) * 0.15),
  biomeAt: () => BIOME.SAND,
  build: p => tinted(dune, p, 34, 0x8a7448, 1, 0)
});

/* ---------- ВУЛКАНИЧЕСКИЙ КОНУС ---------- */
export const volcano = defineElement({
  id: 'volcano', name: 'Вулкан', kind: KIND.RELIEF, tags: ['relief', 'peak'],
  radius: 20, core: 15, cost: 4, profile: 'peak',
  note: 'Конус с кратером. Самый высокий рельеф — для эпичной сцены.',
  heightAt: (x, z, base, t) => {
    const cone = 22 * (1 - clamp(t, 0, 1));
    /* кратер вдавлен в вершину */
    const crater = -5.5 * (1 - smoothstep(0, 0.26, t));
    return cone + crater;
  },
  canPlaceAt: ctx => ctx.near && ctx.near.some(e => e.id === 'volcano')
    ? { ok: false, why: 'второй вулкан рядом' }
    : { ok: true },
  build: p => tinted(volcano, p, 30, 0x4a3a34, .95, .1)
});

export const RELIEF = [hill, ridge, plateau, basin, cliff, crag, dune, volcano];
