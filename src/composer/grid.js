/* =============================================================
   СЕТКА КАРТЫ
   =============================================================
   Компоновщик держит две плоские таблицы (высоты и биомы) и геометрию,
   которая переводит их в мировые координаты. Здесь нет ничего ни про
   детали набора, ни про дорогу — только адресация.

   Сетка своя, а не та, что у демо-генератора: там мир 200 при RES 220
   под витрины рельефа. Карта владельца 96 × 96, и под дорогу шириной
   4.8 нужен шаг, на котором обе ширины ложатся в целое число клеток:
   RES 481 даёт шаг 0.2, то есть 24 клетки на полотно и 48 на базу.
   ============================================================= */

export function makeGrid(world, res) {
  if (res < 2) throw new Error('сетка меньше двух узлов по оси');
  return {
    WORLD: world,
    RES: res,
    STEP: world / (res - 1),
    half: world / 2,
    idx: (i, j) => j * res + i
  };
}

export function cellX(g, i) { return i * g.STEP - g.half; }
export function cellZ(g, j) { return j * g.STEP - g.half; }

export function cellAt(g, x, z) {
  return {
    i: Math.round((x + g.half) / g.STEP),
    j: Math.round((z + g.half) / g.STEP)
  };
}

export function inside(g, i, j) {
  return i >= 0 && j >= 0 && i < g.RES && j < g.RES;
}

/* Билинейное чтение по сетке. Индексы зажаты, а не отброшены: иначе у края
   плиты шаг в одну клетку и прыжок на всю высоту откоса. */
export function sampleGrid(g, data, x, z) {
  const last = g.RES - 1.0001;
  const fi = Math.min(last, Math.max(0, (x + g.half) / g.STEP));
  const fj = Math.min(last, Math.max(0, (z + g.half) / g.STEP));
  const i = fi | 0, j = fj | 0;
  const tx = fi - i, tz = fj - j;
  const n = g.idx(i, j);
  const a = data[n], b = data[n + 1];
  const c = data[n + g.RES], d = data[n + g.RES + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

export function slopeAt(g, h, x, z) {
  const d = g.STEP;
  const hx = sampleGrid(g, h, x + d, z) - sampleGrid(g, h, x - d, z);
  const hz = sampleGrid(g, h, x, z + d) - sampleGrid(g, h, x, z - d);
  const s = Math.hypot(hx, hz) / (2 * d);
  return s > 1 ? 1 : s;
}

/* Уклон в узле сетки дешевле посчитать напрямую: canPlaceAt зовут десятки
   тысяч раз за сборку, и четыре билинейных чтения на узел не нужны. */
export function slopeInCell(g, h, i, j) {
  const n = g.idx(i, j);
  const hl = h[n - (i > 0 ? 1 : 0)];
  const hr = h[n + (i < g.RES - 1 ? 1 : 0)];
  const hd = h[n - (j > 0 ? g.RES : 0)];
  const hu = h[n + (j < g.RES - 1 ? g.RES : 0)];
  const s = Math.hypot(hr - hl, hu - hd) / (2 * g.STEP);
  return s > 1 ? 1 : s;
}