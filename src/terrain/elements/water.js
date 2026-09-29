import * as THREE from 'three';
import { defineElement, KIND, LIQUID, smoothstep, clamp } from './contract.js';

/* =============================================================
   ГИДРО
   Элементы, несущие жидкость. Ключевое требование: озеро обязано быть
   ГОРИЗОНТАЛЬНЫМ независимо от рельефа под ним. Поэтому элемент
   получает в params отметку установки (anchorY) от компоновщика и
   выравнивает дно к своему уровню. Именно ради этого в контракте у
   heightAt есть аргумент base — текущая высота в точке.
   ============================================================= */

const lerp = (a, b, t) => a + (b - a) * t;

/* Выравнивание дна к уровню. У края ядра чаша приподнимается обратно
   к исходному рельефу, дальше работает юбка контракта.
   depth обязателен: без него дно обрезалось до level-0.35, озеро
   получалось глубиной в ладонь, и вода читалась как плоское пятно —
   ни градиента глубины, ни тёмного центра, ни объёма. */
function flattenTo(base, t, level, depth) {
  const target = Math.min(base, level - depth);
  const cup = 1 - smoothstep(0.62, 1.0, t);
  return lerp(base, target, cup) - base;
}

/* Плоская поверхность для превью: уровень всегда на нуле в локали. */
function liquidSurface(radius, color, emissive, rough, metal, squashZ = 1) {
  const g = new THREE.CircleGeometry(radius, 56);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, squashZ);
  const m = new THREE.MeshStandardMaterial({
    color, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 1.3 : 0,
    roughness: rough, metalness: metal, transparent: true, opacity: 0.93
  });
  return new THREE.Mesh(g, m);
}

/* Чаша в разрезе — чтобы в галерее было видно глубину. */
function bowlMesh(topR, botR, depth, color) {
  const g = new THREE.CylinderGeometry(topR, botR, depth, 40, 1, true);
  g.translate(0, -depth / 2, 0);
  g.rotateX(Math.PI);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, side: THREE.BackSide, flatShading: true
  }));
}

/* ---------- ОЗЕРО ---------- */
export const lake = defineElement({
  id: 'lake', name: 'Озеро', kind: KIND.WATER,
  tags: ['water', 'liquid', 'wall'],
  radius: 18, core: 13, cost: 2, profile: 'liquid',
  note: 'Залив на дне котловины. Дорога через воду идёт мостом.',
  heightAt: (x, z, base, t, p) => flattenTo(base, t, p.anchorY - p.dropDepth, p.dropDepth),
  liquid: ctx => ({ kind: LIQUID.WATER, level: ctx.p.anchorY - ctx.p.dropDepth, feather: 3.0 }),
  canPlaceAt: ctx => ctx.slope > 0.6
    ? { ok: false, why: 'озеру нужен ровный участок' }
    : { ok: true },
  defaults: { dropDepth: 4.5 },
  build: p => {
    const d = p.dropDepth, g = new THREE.Group();
    g.add(bowlMesh(lake.core, lake.core * 0.55, d, 0x24405a));
    g.add(liquidSurface(lake.core * 0.97, 0x2a6f96, 0, 0.15, 0.2));
    return g;
  }
});

/* ---------- ЯДОВИТОЕ БОЛОТО ---------- */
export const toxic = defineElement({
  id: 'toxic', name: 'Ядовитое болото', kind: KIND.WATER,
  tags: ['water', 'liquid', 'wall', 'hazard'],
  radius: 14, core: 10, cost: 3, profile: 'liquid',
  note: 'Вязкая зелёная жижа. Проход невозможен, дорога в обход.',
  defaults: { dropDepth: 3.6 },
  heightAt: (x, z, base, t, p) => flattenTo(base, t, p.anchorY - p.dropDepth, p.dropDepth),
  liquid: ctx => ({ kind: LIQUID.TOXIC, level: ctx.p.anchorY - ctx.p.dropDepth, feather: 1.8 }),
  canPlaceAt: ctx => ctx.slope > 0.6
    ? { ok: false, why: 'болоту нужен ровный участок' }
    : { ok: true },
  build: p => {
    const d = p.dropDepth, g = new THREE.Group();
    g.add(bowlMesh(toxic.core, toxic.core * 0.6, d, 0x1d2a12));
    g.add(liquidSurface(toxic.core * 0.95, 0x6ea01a, 0x2c4a08, 0.7, 0));
    return g;
  }
});

/* ---------- ЛАВОВОЕ ОЗЕРО ---------- */
export const lavaLake = defineElement({
  id: 'lavaLake', name: 'Лавовое озеро', kind: KIND.WATER,
  tags: ['water', 'liquid', 'hazard', 'deep'],
  radius: 15, core: 11, cost: 4, profile: 'liquid',
  note: 'Расплав. Самая глубокая и опасная зона карты, светит окрестности.',
  defaults: { dropDepth: 6.0 },
  heightAt: (x, z, base, t, p) => flattenTo(base, t, p.anchorY - p.dropDepth, p.dropDepth),
  liquid: ctx => ({ kind: LIQUID.LAVA, level: ctx.p.anchorY - ctx.p.dropDepth, feather: 1.6 }),
  canPlaceAt: ctx => ctx.slope > 0.6
    ? { ok: false, why: 'расплаву нужен ровный участок' }
    : { ok: true },
  build: p => {
    const d = p.dropDepth, g = new THREE.Group();
    g.add(bowlMesh(lavaLake.core, lavaLake.core * 0.5, d, 0x1a0c06));
    g.add(liquidSurface(lavaLake.core * 0.96, 0xd8500c, 0xff5a10, 0.6, 0));
    return g;
  }
});

/* ---------- РУЧЕЙ ---------- */
export const stream = defineElement({
  id: 'stream', name: 'Ручей', kind: KIND.WATER,
  tags: ['water', 'liquid', 'linear'],
  radius: 22, core: 15, cost: 2, profile: 'liquid',
  /* лента: длина вдоль X больше ширины */
  shape: (dx, dz) => Math.hypot(dx * 0.5, dz * 1.9),
  note: 'Узкий водоток. Задаёт направление ландшафта, удобен под мосты.',
  defaults: { dropDepth: 2.2 },
  heightAt: (x, z, base, t, p) => flattenTo(base, t, p.anchorY - p.dropDepth, p.dropDepth),
  liquid: ctx => ({ kind: LIQUID.WATER, level: ctx.p.anchorY - ctx.p.dropDepth, feather: 2.0 }),
  build: p => {
    const d = p.dropDepth, g = new THREE.Group();
    const b = bowlMesh(stream.core, stream.core * 0.6, d, 0x24405a);
    b.scale.set(1, 1, 0.34);
    g.add(b);
    const s = liquidSurface(stream.core * 0.95, 0x2f7fa8, 0, 0.12, 0.25, 0.34);
    g.add(s);
    return g;
  }
});

/* ---------- ПОРОГ ---------- */
export const weir = defineElement({
  id: 'weir', name: 'Порог', kind: KIND.RELIEF,
  tags: ['relief', 'linear', 'step', 'water'],
  radius: 20, core: 14, cost: 2, profile: 'step',
  shape: (dx, dz) => Math.hypot(dx * 0.55, dz * 1.6),
  note: 'Ступень с водой наверху. Даёт перепад уровня между зонами карты.',
  defaults: { rise: 5.5 },
  heightAt: (x, z, base, t, p) => {
    /* чем дальше по X, тем ниже: это уступ, вода стоит наверху */
    const along = clamp((x / (weir.core || 14)) * 0.5 + 0.5, 0, 1);
    const across = 1 - smoothstep(0.3, 1.0, Math.abs(z) / (weir.core || 14));
    return (1 - along) * p.rise * across;
  },
  liquid: ctx => ({ kind: LIQUID.WATER, level: ctx.p.anchorY + ctx.p.rise - 0.6, feather: 2.2 }),
  canPlaceAt: ctx => ctx.slope > 0.45
    ? { ok: false, why: 'порог ставят на склоне, а не на уступе' }
    : { ok: true },
  build: p => {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(weir.core * 2, weir.core * 1.2, 30, 22);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      pos.setY(k, weir.heightAt(pos.getX(k), pos.getZ(k), 0, 0, 0, p));
    }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x4a5240, roughness: .95, flatShading: true
    })));
    const w = new THREE.PlaneGeometry(weir.core * 1.7, weir.core * 0.9, 1, 1);
    w.rotateX(-Math.PI / 2);
    const surf = new THREE.Mesh(w, new THREE.MeshStandardMaterial({
      color: 0x3d95c0, roughness: .1, metalness: .25, transparent: true, opacity: .88
    }));
    surf.position.y = p.rise - 0.6;
    g.add(surf);
    return g;
  }
});

export const WATER = [lake, toxic, lavaLake, stream, weir];
