import * as THREE from 'three';
import { BIOME } from '../world.js';

/* =============================================================
   КОНТРАКТ ЭЛЕМЕНТА ЛАНДШАФТА
   =============================================================

   Элемент — самодостаточная деталь, которую компоновщик карты кладёт
   на рельеф. Компоновщик НЕ знает ни про шум, ни про дорогу, ни про
   озёра: он владеет только двумя массивами (высоты и биомы) и
   спрашивает у элемента, что в них записать.

   Модель «жёсткое ядро + мягкая юбка»:
     d <= rc  — ядро. Форма элемента настоящая: обрыв, стенка котловины,
               берег озера. Вес 1, шов невозможен — сосед начинает с нуля.
     rc < d <= r — юбка. Вес плавно падает до 0, поэтому элемент
               бесшовно срастается с тем, что уже лежит под ним.
   Именно это даёт и отвес, и отсутствие швов.

   КЛЮЧЕВОЕ ПРАВИЛО: heightAt() возвращает ДЕЛЬТУ к текущей высоте,
   а не абсолютную высоту. Компоновщик делает h += heightAt(x, z, h).
   Базовый аргумент `base` — текущая высота в этой точке; он нужен
   элементам, которые выравнивают поверхность (озеро должно быть
   горизонтальным, а не наклонным вслед за рельефом).
   ============================================================= */

export const KIND = {
  RELIEF: 'relief',      // меняет рельеф
  WATER: 'water',        // несёт жидкость
  BIOME: 'biome',        // красит биом и сажает растительность
  LINK: 'link'           // дорожные перемычки
};

export const LIQUID = { WATER: 'water', TOXIC: 'toxic', LAVA: 'lava' };

/* ---------- математика, общая для всех элементов ---------- */

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;

/* вес ядро/юбка: 1 в ядре, 0 за внешним радиусом */
export function skirt(d, rc, r) {
  if (d >= r) return 0;
  if (d <= rc) return 1;
  return 1 - smoothstep(rc, r, d);
}

/* конус профиля: 0 в центре, 1 на краю ядра — удобная база для холмов */
export function dome(d, rc) {
  return clamp(d / rc, 0, 1);
}

/* шум по мировым координатам, стабильный относительно центра элемента.
   Сдвиг по seed передаётся элементом, поэтому соседние элементы
   с разными seed не дают одинаковый узор. */
export function makeElemNoise(noise, seed) {
  const ox = ((seed % 997) / 997) * 400;
  const oz = (((seed * 31) % 991) / 991) * 400;
  return {
    fbm: (x, z, oct = 4) => noise.fbm((x + ox) * 0.02, (z + oz) * 0.02, oct),
    ridge: (x, z, oct = 4) => noise.ridged((x + ox) * 0.02, (z + oz) * 0.02, oct),
    ang: x => Math.atan2(x[1], x[0])
  };
}

/* =============================================================
   ОПРЕДЕЛЕНИЕ ЭЛЕМЕНТА (ШАБЛОН)
   =============================================================
   defineElement() возвращает ШАБЛОН — неизменяемое описание детали.
   Экземпляр карты получается через el.instantiate({ ...params }) и несёт
   свои параметры (высота установки, поворот, масштаб) в this.params.
   Никакого изменяемого состояния на шаблоне: один и тот же шаблон
   можно ставить на карту сколько угодно раз, экземпляры не мешают
   друг другу.

   Функции элемента НЕ используют this — `this` в стрелках не тот.
   Всё нужное приходит аргументом:
     heightAt(x, z, base, t, p)   дельта высоты; t = 0 в центре, 1 на краю ядра
     biomeAt(x, z, p)             id биома или -1
     liquid(ctx)                  { kind, level, feather } | null; ctx.p = params
     canPlaceAt(ctx)              { ok, why }
     props(rng, p)                [[x, z, scale, rot], ...]
     build(p)                     THREE.Object3D
   ============================================================= */

let _uid = 0;

/**
 * Создаёт шаблон элемента.
 *   id, name, kind          идентичность
 *   radius                  внешний радиус (след с юбкой)
 *   core                    радиус жёсткого ядра
 *   shape(dx, dz)           расстояние до центра; по умолчанию круг,
 *                           элемент может вытянуть след (гряда, дюна)
 *   cost, tags, note        баланс, правила компоновщика, описание
 */
export function defineElement(spec) {
  const coreHeight = spec.heightAt;
  const tpl = {
    radius: 10,
    core: 6,
    cost: 1,
    tags: [],
    shape: (dx, dz) => Math.hypot(dx, dz),
    biomeAt: () => -1,
    liquid: () => null,
    canPlaceAt: () => ({ ok: true }),
    props: () => [],
    seed: (_uid++ * 7919) % 100003,
    ...spec
  };
  if (tpl.core > tpl.radius) tpl.core = tpl.radius;

  /* ЮБКА добавляется последней операцией: элемент задаёт только форму
     ядра, затухание до нуля делает контракт. Формула одна на весь набор. */
  tpl.rawHeight = coreHeight;
  tpl.heightAt = (x, z, base = 0, ox = 0, oz = 0, p = null) => {
    const d = tpl.shape(x - ox, z - oz);
    const w = skirt(d, tpl.core, tpl.radius);
    if (w <= 0) return 0;
    return coreHeight(x, z, base, Math.min(1, d / tpl.core), p) * w;
  };

  tpl.instantiate = (params = {}) => {
    const inst = Object.create(tpl);
    inst.params = Object.freeze({ ...tpl.defaults, ...params });
    inst.mesh = null;
    return inst;
  };

  return tpl;
}

/* Меш инстансится один раз и кэшируется: он неизменен. */
export function elementMesh(inst) {
  if (!inst.mesh) inst.mesh = inst.build(inst.params);
  return inst.mesh;
}

export function disposeElement(inst) {
  const m = inst.mesh;
  if (!m) return;
  m.traverse?.(n => {
    n.geometry?.dispose();
    const mat = n.material;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
    else mat?.dispose();
  });
  inst.mesh = null;
}

/* =============================================================
   ПОСТАНОВКА ЭЛЕМЕНТА КАРТУ
   =============================================================
   Компоновщик держит карту как плоские массивы. Эти функции — единственное
   место, где элемент пишет в карту; сам компоновщик не знает деталей.
*/

export const NONE = 255;

/**
 * Впечатывает элемент в карту высот.
 * @param h        Float32Array RES*RES — текущие высоты
 * @param B        Uint8Array   RES*RES — биомы
 * @param g        { RES, STEP, WORLD, cellToWorld, idx }
 * @param at       { x, z } — центр элемента в мировых координатах
 * @returns { minH, maxH, cells } — для проверки результата компоновщиком
 */
export function stampElement(inst, h, B, g, at) {
  const { RES, STEP, WORLD, idx } = g;
  const half = WORLD / 2;
  const rc = Math.ceil(inst.radius / STEP) + 1;
  const ci = Math.round((at.x + half) / STEP);
  const cj = Math.round((at.z + half) / STEP);
  const p = inst.params;
  const liq = inst.liquid({ h, B, g, at, p, element: inst });

  let minH = Infinity, maxH = -Infinity, cells = 0;
  const paints = inst.tags.includes('biome');

  for (let j = cj - rc; j <= cj + rc; j++) {
    if (j < 0 || j >= RES) continue;
    for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || i >= RES) continue;
      const n = idx(i, j);
      const x = i * STEP - half;
      const z = j * STEP - half;
      const d = inst.shape(x - at.x, z - at.z);
      if (d > inst.radius) continue;

      const before = h[n];
      const dh = inst.heightAt(x, z, before, at.x, at.z, p);
      if (dh !== 0) h[n] = before + dh;
      if (h[n] < minH) minH = h[n];
      if (h[n] > maxH) maxH = h[n];

      if (paints) {
        const b = inst.biomeAt(x, z, p);
        if (b >= 0) B[n] = b;
      }
      if (liq && d <= inst.core && h[n] < liq.level) B[n] = biiome(liq.kind);
      cells++;
    }
  }
  if (!cells) return { minH: 0, maxH: 0, cells: 0, liquid: null };
  return { minH, maxH, cells, liquid: liq };
}

/* id биома для «жидкостного» заливa — берём из BIOME */
function biiome(kind) {
  return kind === LIQUID.WATER ? BIOME.WATER
       : kind === LIQUID.TOXIC ? BIOME.TOXIC
       : BIOME.LAVA;
}

/* =============================================================
   ПОЛЕЗНОЕ ДЛЯ ЭЛЕМЕНТОВ
   ============================================================= */

/* круглая «шапка» для превью: смещённая вниз, чтобы элемент стоял на месте */
export function pedestalMesh(el, seg = 24) {
  const g = new THREE.CylinderGeometry(el.core, el.core * 0.94, 0.35, seg);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x1b2230, roughness: .9, metalness: .1
  }));
  m.position.y = -0.2;
  return m;
}

/* диск-подложка под элемент в галерее */
export function baseDisc(radius) {
  const g = new THREE.CircleGeometry(radius, 48);
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x121722, roughness: 1, metalness: 0
  }));
}

/* сетка-подложка с кольцами радиусов — показывает след элемента */
export function footprintRings(el) {
  const g = new THREE.BufferGeometry();
  const pts = [];
  for (const [rad, col] of [[el.radius, 0x2b6a8a], [el.core, 0x3aa0c0]]) {
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      pts.push(Math.cos(a) * rad, 0, Math.sin(a) * rad, ...colHex(col));
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    pts.filter((_, k) => k % 4 !== 3), 3));
  return g;
}
function colHex(h) { return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
