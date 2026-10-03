/* =============================================================
   КОМПОНОВЩИК КАРТЫ
   =============================================================
   Слой между набором и картой. Берёт описание — плита, сеть дороги,
   база, размеченные детали — и раскладывает его по сетке: сначала
   ставит детали набора через `stampElement`, потом кладёт дорогу, потому
   что дорога выравнивает рельеф под полотном и должна быть последней.

   Чего он НЕ делает: не решает правил игры. Обход, волны, кто откуда
   входит, состав врагов — это наш контент. Здесь только геометрия и вид.
   ============================================================= */

import { BY_ID, stampElement } from '../terrain/elements/index.js';
import { BIOME } from '../terrain/world.js';
import { makeGrid, cellAt, inside, slopeInCell } from './grid.js';
import { rectsOf, distanceField, layRoad, checkEnds, entries, midpoints, linesOf,
         ROAD_SKIRT, ROAD_LIFT } from './road.js';

/**
 * Собирает карту из описания.
 * spec.plate      { size, res, baseY, biome }
 * spec.network    { halfWidth, segments }        — обязательно
 * spec.base       { x, z, half } | null
 * spec.details    [{ element, at: { x, z }, params, force }]
 */
export function composeMap(spec) {
  const net = spec.network;
  if (!net || !Array.isArray(net.segments) || !net.segments.length) {
    throw new Error('описание карты без сети дороги');
  }
  const plate = spec.plate ?? { size: net.plate?.size ?? 96, res: net.plate?.res ?? 481, baseY: 0, biome: BIOME.GRASS };
  const base = spec.base === undefined ? net.base ?? null : spec.base;

  const endProblems = checkEnds(net, plate, base);
  if (endProblems.length && !spec.allowBrokenEnds) {
    throw new Error('сеть дороги не проходит правило концов:\n  ' + endProblems.join('\n  '));
  }

  const g = makeGrid(plate.size, plate.res);
  const h = new Float32Array(g.RES * g.RES).fill(plate.baseY ?? 0);
  const B = new Uint8Array(g.RES * g.RES).fill(plate.biome ?? BIOME.GRASS);

  /* Поле расстояния считается ДО постановки деталей: `canPlaceAt` ждёт
     distRoad, и дорога для правил постановки существует независимо от
     того, что на карте уже лежит. */
  const rects = rectsOf(net);
  const dist = distanceField(g, rects);

  const placed = [];
  const rejected = [];
  const near = [];
  for (const d of spec.details ?? []) {
    const tpl = BY_ID.get(d.element);
    if (!tpl) { rejected.push({ detail: d, why: `в наборе нет "${d.element}"` }); continue; }
    const at = d.at ?? { x: 0, z: 0 };
    const { i, j } = cellAt(g, at.x, at.z);
    if (!inside(g, i, j)) { rejected.push({ detail: d, why: 'мимо плиты' }); continue; }

    const n = g.idx(i, j);
    const ctx = {
      h: h[n],
      slope: slopeInCell(g, h, i, j),
      distRoad: dist[n],
      near: near.slice(),
      overLiquid: isLiquid(B[n])
    };
    const verdict = tpl.canPlaceAt(ctx);
    if (!verdict.ok && !d.force) { rejected.push({ detail: d, why: verdict.why ?? 'правило постановки' }); continue; }

    const inst = tpl.instantiate({ ...d.params });
    const res = stampElement(inst, h, B, g, at);
    placed.push({ element: tpl.id, inst, at, res, forced: !verdict.ok });
    near.push(tpl.id);
  }

  const laid = layRoad(g, h, B, dist, net, {
    skirt: spec.road?.skirt ?? ROAD_SKIRT,
    lift: spec.road?.lift ?? ROAD_LIFT,
    biome: BIOME.ROAD
  });
  if (base) stampBase(g, h, B, base);

  return {
    id: spec.id ?? 'map',
    grid: g,
    h, B,
    plate, base,
    road: {
      halfWidth: net.halfWidth,
      segments: net.segments,
      rects, dist,
      target: laid.target,
      cells: laid.cells,
      paved: laid.paved,
      entries: entries(net, plate),
      lines: { x: linesOf(net, 'x'), z: linesOf(net, 'z') },
      probes: midpoints(net)
    },
    details: placed,
    rejected,
    endProblems
  };
}

/* База лежит поверх полотна: дорога упирается в её край и внутрь не
   заходит, поэтому квадрат закрашивается после дороги. */
function stampBase(g, h, B, base) {
  const { i: ci, j: cj } = cellAt(g, base.x, base.z);
  const r = Math.ceil(base.half / g.STEP);
  for (let j = cj - r; j <= cj + r; j++) {
    if (j < 0 || j >= g.RES) continue;
    for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || i >= g.RES) continue;
      if (Math.abs(i - ci) * g.STEP > base.half) continue;
      if (Math.abs(j - cj) * g.STEP > base.half) continue;
      B[g.idx(i, j)] = BIOME.ROCK;
    }
  }
}

const LIQUIDS = new Set([BIOME.WATER, BIOME.TOXIC, BIOME.LAVA]);
function isLiquid(b) { return LIQUIDS.has(b); }

/* Контекст постановки в произвольной точке: тем же, что получает
   canPlaceAt, но для произвольной мировой координаты. */
export function contextAt(map, x, z) {
  const g = map.grid;
  const { i, j } = cellAt(g, x, z);
  if (!inside(g, i, j)) return null;
  const n = g.idx(i, j);
  return {
    h: map.h[n],
    slope: slopeInCell(g, map.h, i, j),
    distRoad: map.road.dist[n],
    near: map.details.map(d => d.element),
    overLiquid: isLiquid(map.B[n])
  };
}

/* Есть ли полотно в точке. Пробы сети проверяются этой функцией: двадцать
   середин отрезков обязаны давать здесь дорогу, а не траву. */
export function roadAt(map, x, z) {
  const g = map.grid;
  const { i, j } = cellAt(g, x, z);
  if (!inside(g, i, j)) return 0;
  return map.road.dist[g.idx(i, j)];
}