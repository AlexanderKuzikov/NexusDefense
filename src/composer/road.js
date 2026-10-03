/* =============================================================
   ДОРОГА
   =============================================================
   Дорога принадлежит компоновщику, а не набору (см. DECISIONS от
   2026-09-29). Сеть задаётся отрезками осевых линий; полотно — это
   ОБЪЕДИНЕНИЕ прямоугольников, которые из них получаются.

   Именно объединение, а не «сложить прямоугольники»: при полуширине
   2.4 внутренняя и внешняя стороны угла поворота разной длины
   (внутренний радиус 0, внешний 2.4), и наивная сборка в 3D даёт
   нахлёст — два меша в одной точке. Здесь поверхность одна: клетка
   дороги принадлежит объединению, а край полотна задаётся полем
   расстояния до него, поэтому стык корректен по построению, а не
   подгонкой.

   Ширина полотна 4.8 (полуширина 2.4) — из контракта Echoes of Burbenog
   от 2026-09-30. В игре раньше было 1.2, и поворот на 90° в стыке был
   незаметен: откосы вчетверо короче ступеньки сетки.
   ============================================================= */

import { smoothstep } from '../terrain/elements/contract.js';

export const ROAD_HALF = 2.4;    // полуширина полотна
export const ROAD_SKIRT = 0.2;   // ширина откоса за полотном
export const ROAD_LIFT = 0.12;   // насколько полотно выше земли

/* Прямоугольники полотна: каждый отрезок даёт свой, обрезанный краем
   плиты. Ось `along` — вдоль какой оси лежит отрезок, `at` — координата
   второй оси, `from`/`to` — границы вдоль своей оси. */
export function rectsOf(net) {
  const half = net.halfWidth;
  return net.segments.map(s => s.along === 'x'
    ? { x0: s.from - half, x1: s.to + half, z0: s.at - half, z1: s.at + half, seg: s }
    : { x0: s.at - half, x1: s.at + half, z0: s.from - half, z1: s.to + half, seg: s });
}

/* Поле расстояния до объединения прямоугольников: 0 внутри полотна,
   дальше растёт. Считается перебором прямоугольников — их двадцать, а
   клеток меньше четверти миллиона, то есть меньше пяти миллионов
   сравнений. Расстояние до объединения есть минимум по прямоугольникам,
   и внутри каждого прямоугольника расстояние по осям не суммируется,
   поэтому диагональные углы считаются верно, а не «крестиком». */
export function distanceField(g, rects) {
  const d = new Float32Array(g.RES * g.RES);
  const far = g.WORLD * 2;
  for (let j = 0; j < g.RES; j++) {
    const z = j * g.STEP - g.half;
    for (let i = 0; i < g.RES; i++) {
      const x = i * g.STEP - g.half;
      let best = far * far;
      for (let k = 0; k < rects.length; k++) {
        const r = rects[k];
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { best = 0; break; }
        const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
        const dz = z < r.z0 ? r.z0 - z : z > r.z1 ? z - r.z1 : 0;
        const q = dx * dx + dz * dz;
        if (q < best) best = q;
      }
      d[g.idx(i, j)] = best >= far * far ? far : Math.sqrt(best);
    }
  }
  return d;
}

/* Профиль поперечного сечения: ровное полотно ровно на ширину 4.8 и
   узкий откос наружу. Откос узкий не по вкусу, а по счёту: на этой сети
   линии разнесены на 12, и откос в 1.25 единицы смыкал соседние полотна —
   весь угол плиты становился серым. Ширина полотна в контракте ровно
   4.8, и всё, что шире, уже не дорога. */
export function roadProfile(d, half = ROAD_HALF, skirt = ROAD_SKIRT) {
  if (d <= half) return 1;
  return 1 - smoothstep(half, half + skirt, d);
}

/* Границы плиты, на которых обрезается полотно. */
export function plateEdges(plate) {
  const e = plate.size / 2;
  return { west: -e, east: e, north: -e, south: e };
}

/* Отрезки, у которых конец ушёл в край плиты: это входы, их компоновщик
   обязан знать поимённо — по ним приходят волны. */
export function entries(net, plate) {
  const e = plate.size / 2;
  return net.segments.flatMap(s => {
    const out = [];
    const west = Math.abs(s.from + e) < 1e-6, east = Math.abs(s.to - e) < 1e-6;
    if (s.along === 'x') {
      if (west) out.push({ seg: s, side: 'west', along: -e, cross: s.at });
      if (east) out.push({ seg: s, side: 'east', along: e, cross: s.at });
    } else {
      if (west) out.push({ seg: s, side: 'north', along: -e, cross: s.at });
      if (east) out.push({ seg: s, side: 'south', along: e, cross: s.at });
    }
    return out;
  });
}

/* ПРАВИЛО КОНЦОВ. Каждый конец отрезка упирается в край того, к чему
   примыкает: край полотна другой линии (крайнее ±halfWidth от неё),
   край базы или край плиты. Другого объяснения концам нет ни у одного
   отрезка сети владельца, и проверка это подтверждает сорока концами.

   Проверка не декоративная: попиксельное чтение рисунка оставляет в
   данных шум экспорта до 0.12 единицы, и дорога, построенная по таким
   числам, рассыпается на стыках именно там, где конец не попал в край.
   Правило — это форма, в которой шума быть не может. */
export function checkEnds(net, plate, base = null) {
  const half = net.halfWidth;
  const e = plate.size / 2;
  const problems = [];

  const cross = s => (s.along === 'x' ? 'z' : 'x');

  for (const s of net.segments) {
    for (const [which, end] of [['from', s.from], ['to', s.to]]) {
      if (Math.abs(Math.abs(end) - e) < 1e-6) continue;                 // край плиты
      if (base && Math.abs(Math.abs(end) - base.half) < 1e-6) continue;  // край базы

      /* конец лежит на боковой стороне полотна перпендикулярной линии, и
         сам конец — точка этого полотна. Обе половины условия нужны:
         линия на ±40.8 состоит из двух отрезков, и подходит только тот,
         до которого конец дотягивается. */
      const others = net.segments.filter(r => r.along === cross(s) &&
        (Math.abs(end - (r.at - half)) < 1e-6 || Math.abs(end - (r.at + half)) < 1e-6));
      if (!others.length) {
        problems.push(`${s.along} ${s.at}: конец ${which}=${end} не упирается ни в край полотна, ни в край базы, ни в край плиты`);
        continue;
      }
      const reaches = others.some(r => s.at >= r.from - half - 1e-6 && s.at <= r.to + half + 1e-6);
      if (!reaches) {
        const all = others.map(r => `${cross(s)} ${r.at}: ${r.from}..${r.to}`).join(', ');
        problems.push(`${s.along} ${s.at}: конец ${which}=${end} упирается в полотно (${all}), но ось ${s.at} не дотягивается ни до одного`);
      }
    }
  }
  return problems;
}

/* Линии сети — для проверки, что решётка ровно та, что нарисована. */
export function linesOf(net, axis) {
  return [...new Set(net.segments.filter(s => s.along === axis).map(s => s.at))].sort((a, b) => a - b);
}

/* Проба сети: середина каждого отрезка. Все двадцать проб обязаны лежать
   на полотне — это критерий сдачи сети, и он не зависит от кадра. */
export function midpoints(net) {
  return net.segments.map((s, i) => ({
    index: i,
    seg: s,
    x: s.along === 'x' ? (s.from + s.to) / 2 : s.at,
    z: s.along === 'x' ? s.at : (s.from + s.to) / 2
  }));
}

/* Укладка дороги в карту: подъём полотна к общей отметке и биом ROAD.
   Порядок важен — компоновщик кладёт дорогу ПОСЛЕ деталей набора, иначе
   насыпь или мост окажутся пересыпанными. */
export function layRoad(g, h, B, dist, net, opts = {}) {
  const half = net.halfWidth;
  const skirt = opts.skirt ?? ROAD_SKIRT;
  const lift = opts.lift ?? ROAD_LIFT;
  const roadBiome = opts.biome ?? 9;   // BIOME.ROAD, числом — чтобы модуль не тянул world.js

  let sum = 0, n = 0;
  for (let k = 0; k < dist.length; k++) {
    if (dist[k] === 0) { sum += h[k]; n++; }
  }
  const target = (n ? sum / n : 0) + lift;

  let cells = 0;
  for (let k = 0; k < dist.length; k++) {
    const k2 = roadProfile(dist[k], half, skirt);
    if (k2 <= 0) continue;
    h[k] = h[k] + (target - h[k]) * k2;
    cells++;
  }
  let paved = 0;
  /* Биом ROAD ставится по НУЛЕВОМУ расстоянию, а не по «не дальше
     полуширины». Расстояние ≤ half попадает ещё и в вогнутые углы и в
     зазоры между полотнами: там клетка не лежит на дороге, но стоит
     ближе, чем полполотна. Именно на этом разошлись бы сетка и вид. */
  for (let k = 0; k < dist.length; k++) {
    if (dist[k] === 0) { B[k] = roadBiome; paved++; }
  }
  return { target, cells, paved };
}