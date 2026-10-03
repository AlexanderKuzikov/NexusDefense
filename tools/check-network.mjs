/* Проверка сети дороги и компоновщика без браузера.
   Запуск:  node --import ./tools/register-stub.mjs tools/check-network.mjs

   Сеть владельца — это известный ответ: двадцать отрезков из файла
   `Echoes-of-Burbenog/docs/Map-and-Router.png`. Проверять её пикселями
   можно, но тогда нужен браузер, кадр и фрустум, а дефект сети виден
   раньше: конец, не упёршийся в край, рассыпается на стыке. Поэтому
   здесь проверяется правило концов и то, что проба середины каждого
   отрезка лежит на полотне, — то же самое, что потом читается с кадра. */

import { OWNER_NETWORK, OWNER_PLATE, OWNER_BASE, AXIS_LINES } from '../src/composer/network.js';
import { composeMap, roadAt } from '../src/composer/composer.js';
import { checkEnds, entries, linesOf, rectsOf, roadProfile, ROAD_SKIRT } from '../src/composer/road.js';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const net = OWNER_NETWORK;
const map = composeMap({ id: 'owner', plate: OWNER_PLATE, network: net, base: OWNER_BASE });
const g = map.grid;

/* ---------- состав сети ---------- */
const along = a => net.segments.filter(s => s.along === a);
ok(net.segments.length === 20, `отрезков ${net.segments.length}, а должно быть 20`);
ok(along('x').length === 10, `горизонтальных ${along('x').length}, а должно быть 10`);
ok(along('z').length === 10, `вертикальных ${along('z').length}, а должно быть 10`);

for (const axis of ['x', 'z']) {
  const lines = linesOf(net, axis);
  ok(lines.length === 7, `${axis}: линий ${lines.length}, а должно быть 7`);
  const want = [...AXIS_LINES].sort((a, b) => a - b);
  ok(lines.every((v, k) => Math.abs(v - want[k]) < 1e-6),
     `${axis}: линии ${lines.join(', ')} не равны ${want.join(', ')}`);
}

/* ---------- правило концов ---------- */
const ends = checkEnds(net, OWNER_PLATE, OWNER_BASE);
ends.forEach(p => fails.push('конец: ' + p));

/* ---------- входы ---------- */
const ins = entries(net, OWNER_PLATE);
ok(ins.length === 4, `входов ${ins.length}, а должно быть 4`);
for (const side of ['west', 'east', 'north', 'south']) {
  const hit = ins.filter(e => e.side === side);
  ok(hit.length === 1, `вход «${side}»: ${hit.length} штук, а должен быть один`);
  if (hit.length === 1) {
    ok(Math.abs(Math.abs(hit[0].along) - 48) < 1e-6, `вход «${side}» стоит на ${hit[0].along}, а не на ±48`);
  }
}

/* ---------- база ---------- */
ok(Math.abs(OWNER_BASE.half * 2 - 9.6) < 1e-6, `база ${OWNER_BASE.half * 2} × ${OWNER_BASE.half * 2}, а должна быть 9.6`);
ok(OWNER_BASE.half / net.halfWidth === 2, 'сторона базы не равна двум ширинам дороги');
for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const x = OWNER_BASE.x + dx * OWNER_BASE.half;
  const z = OWNER_BASE.z + dz * OWNER_BASE.half;
  ok(roadAt(map, x, z) === 0, `в базу не входит дорога со стороны (${dx}, ${dz})`);
}

/* ---------- пробы середины каждого отрезка ---------- */
const probes = map.road.probes;
ok(probes.length === 20, `проб ${probes.length}, а должно быть 20`);
let pavedProbes = 0;
for (const p of probes) {
  const d = roadAt(map, p.x, p.z);
  if (d === 0) pavedProbes++;
  else fails.push(`проба ${p.index}: (${p.x}, ${p.z}) — расстояние до полотна ${d.toFixed(2)}, а ноль`);
}
ok(pavedProbes === 20, `на полотне ${pavedProbes} проб из 20`);

/* ---------- ширина полотна ----------
   Меряется профилем через середину отрезка: у всех двадцати отрезков
   середина не совпадает ни с одной линией сети, поэтому перпендикуляр
   пересекает только своё полотно. Точками «вне полотна» мерить нельзя —
   на Т-стыке рядом лежит полотно другой линии, и она заведёт проверку. */
{
  const reach = seg => {
    const mid = (seg.from + seg.to) / 2;
    let inside = 0;
    for (let d = 0.02; d < net.halfWidth + 1.5; d += 0.02) {
      for (const side of [-1, 1]) {
        const x = seg.along === 'x' ? mid : seg.at + side * d;
        const z = seg.along === 'x' ? seg.at + side * d : mid;
        if (roadAt(map, x, z) === 0) inside++;
      }
    }
    return inside * 0.02;
  };
  for (const s of net.segments) {
    const w = reach(s);
    /* клетка 0.2 даёт до ±0.1 на срезе, то есть половина шага в каждую сторону */
    ok(Math.abs(w - net.halfWidth * 2) <= g.STEP + 0.02,
       `${s.along} ${s.at}: полотно шириной ${w.toFixed(2)}, а должно быть ${net.halfWidth * 2}`);
  }
}

/* ---------- стык: полотно непрерывно на всех пересечениях ---------- */
let crossings = 0;
for (const h of along('x')) {
  for (const v of along('z')) {
    const inH = h.from - net.halfWidth <= v.at && v.at <= h.to + net.halfWidth;
    const inV = v.from - net.halfWidth <= h.at && h.at <= v.to + net.halfWidth;
    if (!inH || !inV) continue;
    crossings++;
    /* точка на пересечении центральных линий и обе кромки по диагонали:
       в Т-стыке клетка по ту же сторону от оси обязана быть полотном,
       иначе в стыке дыра шириной в полполотна */
    for (const [dx, dz] of [[0, 0], [net.halfWidth - 0.05, 0], [-(net.halfWidth - 0.05), 0],
                           [0, net.halfWidth - 0.05], [0, -(net.halfWidth - 0.05)]]) {
      const d = roadAt(map, v.at + dx, h.at + dz);
      if (d > 0.001) fails.push(`стык (${v.at}, ${h.at}) смещение (${dx}, ${dz}): расстояние ${d.toFixed(3)} — дыра`);
    }
  }
}
ok(crossings > 0, 'ни одного пересечения отрезков — сеть не проверялась');

/* ---------- объединение без нахлёста ----------
   Площадь объединения считается ВТОРЫМ методом: сканирующей линией по Z,
   где на каждой строке интервалы прямоугольников сливаются в один. Если
   полотно было бы посчитано дважды, две площади разошлись бы. */
const rects = rectsOf(net);
{
  const span = new Float64Array(g.RES);
  let area = 0;
  for (let j = 0; j < g.RES; j++) {
    const z = j * g.STEP - g.half;
    span.fill(0);
    for (const r of rects) {
      if (z < r.z0 || z > r.z1) continue;
      const a = Math.max(0, Math.round((r.x0 + g.half) / g.STEP));
      const b = Math.min(g.RES - 1, Math.round((r.x1 + g.half) / g.STEP));
      for (let i = a; i <= b; i++) span[i] = 1;
    }
    area += span.reduce((s, v) => s + v, 0);
  }
  area *= g.STEP * g.STEP;
  const gridArea = map.road.paved * g.STEP * g.STEP;
  /* Допуск — не смягчение, а счёт края: клетка берётся по центру, а
     скан-линия по пересечению интервалов, то есть на периметре они
     расходятся примерно на половину шага. При периметре ~1100 это 1.5%. */
  ok(Math.abs(area - gridArea) / area < 0.03,
     `полотно по сетке ${gridArea.toFixed(1)} и по скан-линии ${area.toFixed(1)} разошлись — двойной счёт или потерянный стык`);
  const sumRect = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  ok(area < sumRect, `объединение ${area.toFixed(1)} не меньше суммы прямоугольников ${sumRect.toFixed(1)} — перекрытия посчитаны дважды`);
}

/* ---------- профиль без ступенек ---------- */
{
  /* Предел — сам максимум smoothstep на единицу длины, то есть 1.5 / span.
     Считать «скак» выше этого нельзя: гладкость и есть этот максимум,
     и любой порог кроме него просто сравнивает функцию с самой собой. */
  const maxStep = 1.5 * 0.01 / ROAD_SKIRT;
  let prev = roadProfile(0), jump = 0, rise = 0;
  for (let d = 0; d < 6; d += 0.01) {
    const k = roadProfile(d);
    jump = Math.max(jump, Math.abs(k - prev));
    rise = Math.max(rise, k - prev);
    prev = k;
  }
  ok(rise <= 1e-9, `профиль полотна растёт на ${rise.toFixed(5)} — край полотна не спадает`);
  ok(jump <= maxStep * 1.001, `профиль скачет на ${jump.toFixed(4)} при пределе ${maxStep.toFixed(4)} — ступенька в стыке`);
}

/* ---------- числа ---------- */
let bad = 0;
for (let k = 0; k < map.h.length; k++) if (!Number.isFinite(map.h[k])) bad++;
ok(bad === 0, `нечисловых высот ${bad}`);

let maxLift = 0, flat = 0;
for (let k = 0; k < map.h.length; k++) {
  if (map.road.dist[k] === 0) { flat++; maxLift = Math.max(maxLift, map.h[k]); }
}
ok(flat > 0, 'полотно не содержит ни одной клетки');

/* ---------- компоновщик раскладывает детали набора ---------- */
const withDetail = composeMap({
  plate: OWNER_PLATE, network: net, base: OWNER_BASE,
  details: [
    { element: 'plateau', at: { x: -33.6, z: -33.6 } },                 /* в углу плиты, далеко от дороги */
    { element: 'causeway', at: { x: 40.8, z: -40.8 } },                /* на дороге, в угловой петле */
    { element: 'causeway', at: { x: 0, z: 30 }, force: true }          /* мимо дороги — должен быть отклонён */
  ]
});
ok(withDetail.details.length === 2, `деталей принято ${withDetail.details.length}, а должны быть две`);
ok(withDetail.rejected.length === 1, `отклонено ${withDetail.rejected.length}, а должна быть одна`);
ok(withDetail.details.some(d => d.element === 'plateau'), 'рельеф из набора не поставлен');
ok(withDetail.details.some(d => d.element === 'causeway'), 'перемычка из набора не поставлена');
let lifted = 0;
for (let k = 0; k < withDetail.h.length; k++) if (withDetail.h[k] > 1) lifted++;
ok(lifted > 0, 'деталь набора не подняла рельеф');

/* ---------- отчёт ---------- */
console.log('СЕТЬ ВЛАДЕЛЬЦА');
console.log(`  плита            ${OWNER_PLATE.size} × ${OWNER_PLATE.size}, сетка ${g.RES} × ${g.RES}, шаг ${g.STEP}`);
console.log(`  отрезков         ${net.segments.length} (${along('x').length} горизонтальных, ${along('z').length} вертикальных)`);
console.log(`  линий по оси     ${linesOf(net, 'x').join(', ')}`);
console.log(`  база             ${OWNER_BASE.half * 2} × ${OWNER_BASE.half * 2}, входов ${ins.length}: ${ins.map(e => e.side).join(' · ')}`);
console.log(`  пересечений      ${crossings}, все дают полотно без дыр`);
console.log(`  полотна клеток   ${flat}, площадь ${(flat * g.STEP * g.STEP).toFixed(1)} (сумма прямоугольников ${rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0).toFixed(1)})`);
console.log(`  подъём полотна   ${(map.road.target - OWNER_PLATE.baseY).toFixed(3)} над землёй`);
console.log(`  деталей набора   ${withDetail.details.map(d => d.element).join(', ')}, отклонено ${withDetail.rejected.map(r => r.why).join('; ')}`);

if (fails.length) {
  console.log('\nПРОБЛЕМЫ:');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\nСеть дороги: OK');