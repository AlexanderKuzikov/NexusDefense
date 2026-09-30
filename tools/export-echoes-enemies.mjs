// Выгрузка семи существ бестиария в формат Echoes of Burbenog.
//
// Задача NDD-0002. Формат — тот же, что в NDD-0001, и writer glTF 2.0 здесь
// намеренно продублирован: их файл лежит в соседнем репозитории, а общий
// модуль связал бы две выгрузки. Модели, в отличие от башен, не берутся из
// витрины готовыми — они лепятся под заданный бокс (см. FIT ниже).
//
// Запуск: node tools/export-echoes-enemies.mjs [--check]
//
// Гравитация и посадка: тело стоит ногами на PATH_Y, поэтому минимум по Y
// у наземных моделей равен нулю, а у парящих равен hoverY из манифеста.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(PROJECT_ROOT, 'export', 'echoes');

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_SHORT = 5123;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;
const MODE_TRIANGLES = 4;
const PRECISION = 1e5;

// Бюджет скопирован из их asset-budgets.ts. В отличие от башен здесь
// проверяется ещё и meshesPerModel: у нас на волне 16 существ, и 16 × meshes
// — это вызовы отрисовки, которые идут в общий бюджет сцены вместе с башнями.
const MODEL_BUDGET = {
  triangles: 5000,
  bytes: 1024 * 1024,
  nodes: 32,
  meshes: 32,
  materials: 16,
  textures: 0,
  height: 4.0,
  footprintRadius: 0.85,
  pivotYTolerance: 0.01,
};

// Треугольники на существо: полоса из задачи. Ниже 800 модель не читается как
// модель, выше 4000 — это уже запрос на LOD, а не повод поднять бюджет.
const TRIANGLE_BAND = { min: 800, max: 4000 };
// Не из их контракта: клиент поднимает emissiveIntensity узла из манифеста,
// и узел-акцент должен остаться акцентом, а не светиться целиком.
const MESH_BAND = { max: 4, min: 1 };
const ACCENT_SHARE = 0.35;

const REGISTRY_BUDGET = { bytes: 8 * 1024 * 1024, triangles: 150000, models: 64 };

// Единицы заказчика, он же заморозил их в контенте. Ширина и высота из
// таблицы задачи — не обсуждаются. Глубина в задаче не задана: она следует
// из масштаба по ширине, поэтому силуэт не растягивается в плане (см. FIT).
//
// Модели описаны ниже по файлу, а список — после них: `const` не поднимается,
// а порядок чтения здесь важнее, чем близость таблицы к верху.
const MODEL_SPECS = [
  {
    id: 'husk',
    width: 0.78,
    height: 0.47,
    accent: 'core',
    source: 'HUSK, CRAWLER — язык бестиария',
    note: 'Широкий низкий танк: самый частый, поэтому самый простой силуэт',
  },
  {
    id: 'runner',
    width: 0.27,
    height: 0.80,
    accent: 'core',
    source: 'LANCER, RAVAGER — язык бестиария',
    note: 'Тонкий дротик: единственная вертикаль в росте, читается штрихом',
  },
  {
    id: 'wisp',
    width: 0.86,
    height: 0.92,
    hoverY: 0.16,
    accent: 'core',
    source: 'WISP — язык бестиария',
    note: 'Парящий: корпус не касается земли, хвост почти доходит до дороги',
  },
  {
    id: 'swarmling',
    width: 0.15,
    height: 0.41,
    accent: 'core',
    source: 'CRAWLER, SWARM QUEEN — язык бестиария',
    note: 'Мелкое тело на тонких длинных ногах: самый мелкий, читается точкой над ножками',
  },
  {
    id: 'carapace',
    width: 0.89,
    height: 0.70,
    accent: 'core',
    source: 'SIEGE LOBBER, JUGGERNAUT — язык бестиария',
    note: 'Широкая низкая база с плугом: тяжёлый, единственный с клинком впереди',
  },
  {
    id: 'mote',
    width: 0.50,
    height: 0.44,
    hoverY: 0.18,
    accent: 'core',
    source: 'MOTE, PHASE WARDEN — язык бестиария',
    note: 'Сплошная плита над яркой макушкой, висит с просветом',
  },
  {
    id: 'maw',
    width: 0.98,
    height: 0.86,
    accent: 'core',
    source: 'BRUTE, SWARM QUEEN — язык бестиария',
    note: 'Тяжёлое тесто на четырёх лапах с раскрытой пастью: самое большое',
  },
];

const fail = (message) => {
  throw new Error(`contract violation: ${message}`);
};

const round = (value) => {
  const rounded = Math.round(value * PRECISION) / PRECISION;
  return rounded === 0 ? 0 : rounded;
};

const srgbToLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

// Тон и палитра — наши: решение владельца из NDD-0001. `metal()` в core.js
// подмешивает к цвету холодную сталь, и без этого повторения существо
// вернётсяother цветом, чем на витрине. Формула скопирована, чтобы палитра
// не «поплыла» вместе с правкой core.js.
const STEEL = 0x8d99a8;

const metalTone = (hex) => {
  const base = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => srgbToLinear(c / 255));
  const steel = [(STEEL >> 16) & 255, (STEEL >> 8) & 255, STEEL & 255].map((c) => srgbToLinear(c / 255));
  return base.map((value, index) => round(value + (steel[index] - value) * 0.36));
};

// Акцент — эмиссия неона, а не его базовая окраска: у neon() база почти
// чёрная, и вершины в базовом цвете дали бы чёрный акцент вместо светящегося.
//
// Тон приглушён: полная яркость неона в вершинах под ключевым светом 1.9
// клипается в белое, и акцент перестаёт отличаться от корпуса. То, что в
// бестиарии даёт неон, здесь должен дорисовывать клиент своим emissiveIntensity
// на узле из манифеста — то есть ровно так же, как у башен.
const ACCENT_VALUE = 0.55;

const accentTone = (hex) =>
  [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
    .map((c) => round(srgbToLinear(c / 255) * ACCENT_VALUE));

// Палитра существ взята из бестиария: у каждого вида там свой акцент.
const PALETTE = {
  husk: { body: 0x3a3630, trim: 0x4a443c, accent: 0xffb44a },
  runner: { body: 0x3a3a2c, trim: 0xc8c0a0, accent: 0xffe14d },
  wisp: { body: 0x2a1f3a, trim: 0x6a5a80, accent: 0xc46bff },
  swarmling: { body: 0x2a3a2c, trim: 0x8aa08a, accent: 0x8cff5a },
  carapace: { body: 0x3c3328, trim: 0x6a5c48, accent: 0x35e0ff },
  mote: { body: 0x1e3a30, trim: 0x8ad8c0, accent: 0x00ffa3 },
  maw: { body: 0x3a2a24, trim: 0x6a4f44, accent: 0xff4a2e },
};

const TAU = Math.PI * 2;

// ---------- примитивы ----------

// Треугольник с проверкой намотки против заданной нормали: писать намотку руками
// в семи моделях — это гарантированная ошибка в одном треугольнике, которая
// видна только как чёрная грань в отражении.
const triangle = (geo, a, b, c, na, nb, nc) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
  const mx = (na[0] + nb[0] + nc[0]) / 3, my = (na[1] + nb[1] + nc[1]) / 3, mz = (na[2] + nb[2] + nc[2]) / 3;
  const flip = gx * mx + gy * my + gz * mz < 0;
  const base = geo.p.length / 3;
  const order = flip ? [a, c, b] : [a, b, c];
  const normals = flip ? [na, nc, nb] : [na, nb, nc];
  order.forEach((vertex, index) => {
    geo.p.push(vertex[0], vertex[1], vertex[2]);
    geo.n.push(normals[index][0], normals[index][1], normals[index][2]);
  });
  geo.i.push(base, base + 1, base + 2);
};

const quad = (geo, a, b, c, d, na, nb, nc, nd) => {
  triangle(geo, a, b, c, na, nb, nc);
  triangle(geo, a, c, d, na, nc, nd);
};

const box = (w, h, d) => {
  const geo = { p: [], n: [], i: [] };
  const x = w / 2, y = h / 2, z = d / 2;
  const v = (a, b, c) => [a, b, c];
  quad(geo, v(x, -y, -z), v(x, y, -z), v(x, y, z), v(x, -y, z), [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
  quad(geo, v(-x, -y, z), v(-x, y, z), v(-x, y, -z), v(-x, -y, -z), [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
  quad(geo, v(-x, y, -z), v(-x, y, z), v(x, y, z), v(x, y, -z), [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
  quad(geo, v(-x, -y, z), v(-x, -y, -z), v(x, -y, -z), v(x, -y, z), [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0]);
  quad(geo, v(-x, -y, z), v(x, -y, z), v(x, y, z), v(-x, y, z), [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
  quad(geo, v(x, -y, -z), v(-x, -y, -z), v(-x, y, -z), v(x, y, -z), [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]);
  return geo;
};

// Усечённый цилиндр: rTop = 0 даёт конус, у которого верхняя крышка вырождена
// и не генерируется — иначе появляются вырожденные треугольники с нулевой
// площадью, а они всё равно считаются бюджетом.
const cylinder = (rTop, rBot, h, seg, { flat = false } = {}) => {
  const geo = { p: [], n: [], i: [] };
  const slope = (rBot - rTop) / h;
  const radial = (radius, angle, y) => [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  const sideNormal = (angle) => {
    const n = [Math.cos(angle), slope, Math.sin(angle)];
    const length = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / length, n[1] / length, n[2] / length];
  };
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const b0 = radial(rBot, a0, -h / 2), b1 = radial(rBot, a1, -h / 2);
    const t0 = radial(rTop, a0, h / 2), t1 = radial(rTop, a1, h / 2);
    if (flat) {
      const n0 = sideNormal((a0 + a1) / 2);
      quad(geo, b0, t0, t1, b1, n0, n0, n0, n0);
    } else {
      quad(geo, b0, t0, t1, b1, sideNormal(a0), sideNormal(a0), sideNormal(a1), sideNormal(a1));
    }
  }
  const cap = (radius, y, normal) => {
    if (radius <= 0) return;
    const centre = [0, y, 0];
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      triangle(geo, centre, radial(radius, a0, y), radial(radius, a1, y), normal, normal, normal);
    }
  };
  cap(rBot, -h / 2, [0, -1, 0]);
  cap(rTop, h / 2, [0, 1, 0]);
  return geo;
};

const ICO_T = (1 + Math.sqrt(5)) / 2;
const icoVertex = (i) => {
  const raw = [
    [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
    [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
    [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
  ][i];
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  return [raw[0] / length, raw[1] / length, raw[2] / length];
};

const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const icosahedron = (r, detail = 0) => {
  let faces = ICO_FACES.map((face) => face.map((index) => icoVertex(index)));
  for (let level = 0; level < detail; level += 1) {
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2];
      const ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2];
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  const geo = { p: [], n: [], i: [] };
  for (const [a, b, c] of faces) {
    const scale = (vertex) => [vertex[0] * r, vertex[1] * r, vertex[2] * r];
    triangle(geo, scale(a), scale(b), scale(c), a, b, c);
  }
  return geo;
};

const octahedron = (r) => icosahedron(r, 0) && {
  p: [],
  n: [],
  i: [],
  // восьмигранник строится напрямую: у икосаэдра нет такой формы в коде выше,
  // а для мелких деталей (глаз, зуб) гранёный ромб читается лучше сферы
};

const octa = (r) => {
  const geo = { p: [], n: [], i: [] };
  const v = [
    [r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r],
  ];
  const faces = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ];
  for (const [a, b, c] of faces) {
    const na = v[a].map((value) => value / r);
    const nb = v[b].map((value) => value / r);
    const nc = v[c].map((value) => value / r);
    triangle(geo, v[a], v[b], v[c], na, nb, nc);
  }
  return geo;
};

const orb = (r, widthSeg = 12, heightSeg = 8) => {
  const geo = { p: [], n: [], i: [] };
  const point = (phi, theta) => {
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    return [[x * r, y * r, z * r], [x, y, z]];
  };
  for (let i = 0; i < heightSeg; i += 1) {
    const phi0 = (i / heightSeg) * Math.PI, phi1 = ((i + 1) / heightSeg) * Math.PI;
    for (let j = 0; j < widthSeg; j += 1) {
      const theta0 = (j / widthSeg) * TAU, theta1 = ((j + 1) / widthSeg) * TAU;
      const [p00, n00] = point(phi0, theta0);
      const [p01, n01] = point(phi0, theta1);
      const [p10, n10] = point(phi1, theta0);
      const [p11, n11] = point(phi1, theta1);
      quad(geo, p00, p10, p11, p01, n00, n10, n11, n01);
    }
  }
  return geo;
};

const torus = (radius, tube, radialSeg = 6, tubularSeg = 18) => {
  const geo = { p: [], n: [], i: [] };
  const point = (u, v) => {
    const cos = Math.cos(v), sin = Math.sin(v);
    return [
      [(radius + tube * cos) * Math.cos(u), tube * sin, (radius + tube * cos) * Math.sin(u)],
      [cos * Math.cos(u), sin, cos * Math.sin(u)],
    ];
  };
  for (let i = 0; i < tubularSeg; i += 1) {
    const u0 = (i / tubularSeg) * TAU, u1 = ((i + 1) / tubularSeg) * TAU;
    for (let j = 0; j < radialSeg; j += 1) {
      const v0 = (j / radialSeg) * TAU, v1 = ((j + 1) / radialSeg) * TAU;
      const [p00, n00] = point(u0, v0);
      const [p01, n01] = point(u0, v1);
      const [p10, n10] = point(u1, v0);
      const [p11, n11] = point(u1, v1);
      quad(geo, p00, p10, p11, p01, n00, n10, n11, n01);
    }
  }
  return geo;
};

// ---------- детали на языке бестиария ----------

// Сборка «части» — с цветом, трансформом и группой. Части не пишут себя в
// файл по одной: группа собирается в один меш, потому что 16 существ на волне
// упираются в вызовы отрисовки раньше, чем в треугольники.
const part = (geo, color, { t = [0, 0, 0], r = [0, 0, 0], s = 1, group = 'body' } = {}) => ({
  geo,
  color,
  t,
  r,
  s,
  group,
});

const P = (geo, color, place) => part(geo, color, place);

// Панцирь из бестиария: плита с ярусами панелей и брюхом. Ярусы — читаемость на
// 13 пикселях, а не деталь: у плиты без них силуэт сливается в прямоугольник.
const carapace = (w, h, d, color, trim, panels, place) => {
  const parts = [P(box(w, h, d), color, place)];
  for (let i = 0; i < panels; i += 1) {
    const t = panels === 1 ? 0 : i / (panels - 1) - 0.5;
    parts.push(P(box(w * 0.82, h * 0.18, d * 0.06), trim, {
      t: [place.t[0], place.t[1] + h * (0.12 + i * 0.24), place.t[2] + d * 0.51 + t * d * 0.04],
    }));
  }
  parts.push(P(box(w * 0.8, h * 0.3, d * 0.86), trim, {
    t: [place.t[0], place.t[1] - h * 0.5, place.t[2]],
  }));
  return parts;
};

// Нога в два сустава, как в parts.js: бедро, голень, ступня-конус. Ступня
// обязательна: без неё нога кончается квадратом, и на 13 пикселях существо
// выглядит как поставленное на ребро.
const leg = (x, y, z, height, seg, color, foot, side) => {
  const kneeY = y - height * 0.88;
  return [
    P(box(seg, height * 0.62, seg * 0.8), color, { t: [x, y, z], r: [0, 0, -side * 0.5] }),
    P(icosahedron(seg * 0.62, 0), foot, { t: [x + side * height * 0.2, kneeY, z] }),
    P(box(seg * 0.7, height * 0.58, seg * 0.6), color, {
      t: [x + side * height * 0.3, kneeY, z],
      r: [0, 0, side * 0.35],
    }),
    P(cylinder(0, seg * 0.62, seg * 1.1, 8), foot, {
      t: [x + side * height * 0.45, kneeY - height * 0.5, z],
      r: [Math.PI, 0, 0],
    }),
  ];
};

// Заклёпки по кромке. Вблизи это фактура, на 13 пикселях — неровность контура,
// и та и другая дешевле, чем один гладкий бокс без единой линии.
const rivets = (points, radius, color) =>
  points.map((t) => P(octa(radius), color, { t }));

// Глаза: две яркие точки на передней плоскости. Самое дешёвое, что превращает
// пятно в существо, и на игровом масштабе глаз — это всё, что остаётся.
const eyes = (accentColor, spread, height, reach, radius) =>
  [-1, 1].map((side) => P(octa(radius), accentColor, { t: [side * spread, height, reach] }));

const spike = (x, y, z, length, radius, color, tilt, seg = 8) => [
  P(cylinder(0, radius, length, seg), color, { t: [x, y, z], r: tilt }),
];

// ---------- модели ----------
//
// Поверхность набрана сеткой: каждая грань на игровом масштабе меньше
// пикселя, поэтому «сетка» здесь — сглаженная оболочка вместо крупных граней
// примитива. Плоская заливка на 13 пикселях читается как дыры.

const husk = () => {
  const p = PALETTE.husk;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    // Оболочка-икосаэдр под панцирной плитой: у одной плиты силуэт читается
    // как кирпич, а скруглённая оболочка даёт тот же контур с переходом.
    P(icosahedron(0.66, 1), body, { t: [0, 0.52, -0.02], s: [1.02, 0.58, 0.74] }),
    ...carapace(1.30, 0.40, 0.92, body, trim, 3, { t: [0, 0.56, 0] }),
    P(box(0.44, 0.26, 0.34), body, { t: [0, 0.54, 0.60] }),
    P(box(0.30, 0.10, 0.20), trim, { t: [0, 0.44, 0.78] }),
    ...spike(0, 0.98, -0.06, 0.52, 0.10, accent, [0.18, 0, 0], 10),
    ...spike(0, 0.78, 0.30, 0.26, 0.08, accent, [0.32, 0, 0], 8),
    P(box(0.34, 0.16, 0.22), trim, { t: [0, 0.60, -0.50] }),
  ];
  for (const side of [-1, 1]) {
    parts.push(P(cylinder(0.06, 0.10, 0.34, 10, { flat: true }), trim, {
      t: [side * 0.72, 0.62, 0.08],
      r: [0, 0, side * 0.9],
    }));
    // Асимметрия рук — силуэтный признак: два разных плеча не дают телу
    // прочитаться прямоугольником на 13 пикселях.
    parts.push(P(box(0.13, 0.40, 0.14), body, { t: [side * 0.66, 0.40, 0.42], r: [0.2, 0, side * -0.5] }));
    parts.push(P(icosahedron(0.11, 1), trim, { t: [side * 0.72, 0.22, 0.50] }));
    parts.push(...leg(side * 0.46, 0.40, 0.30, 0.40, 0.11, body, trim, side));
    parts.push(...leg(side * 0.46, 0.40, -0.30, 0.40, 0.11, body, trim, side));
    parts.push(P(box(0.20, 0.10, 0.22), trim, { t: [side * 0.66, 0.42, 0.30] }));
    parts.push(P(box(0.20, 0.10, 0.22), trim, { t: [side * 0.66, 0.42, -0.30] }));
  }
  parts.push(...rivets(
    [-0.20, 0, 0.20].flatMap((z) => [[0.66, 0.60, z], [-0.66, 0.60, z]]),
    0.045,
    trim,
  ));
  parts.push(P(icosahedron(0.10, 2), accent, { t: [0, 0.54, 0.72] }));
  parts.push(...eyes(accent, 0.13, 0.56, 0.76, 0.05));
  return parts;
};

const runner = () => {
  const p = PALETTE.runner;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    P(cylinder(0.03, 0.15, 1.00, 10, { flat: true }), body, { t: [0, 0.52, 0.02], r: [0.26, 0, 0] }),
    P(icosahedron(0.15, 2), body, { t: [0, 0.20, 0.14], s: [1, 0.7, 1.15] }),
    P(box(0.10, 0.08, 0.16), trim, { t: [0, 0.20, 0.26] }),
    ...spike(0, 0.26, 0.30, 0.26, 0.05, trim, [Math.PI / 2 - 0.2, 0, 0], 8),
    ...spike(0, 0.34, -0.16, 0.24, 0.05, trim, [-Math.PI / 2 - 0.5, 0, 0], 8),
    ...spike(0, 0.80, -0.14, 0.44, 0.07, accent, [-0.5, 0, 0], 9),
    ...spike(0, 0.44, 0.06, 0.18, 0.05, accent, [0.3, 0, 0], 8),
    // Наклонённые рёбра вдоль шпиля: у одиночного конуса силуэт читается как
    // карандаш, а у конуса с рёбрами — как живое, и обе фигуры тонкие.
    ...[0.30, 0.42, 0.54, 0.66, 0.76].map((y) => P(torus(0.085, 0.014, 5, 12), trim, { t: [0, y, 0.02], r: [0.26, 0, 0] })),
  ];
  for (const side of [-1, 1]) {
    parts.push(...leg(side * 0.09, 0.14, 0.04, 0.14, 0.05, body, trim, side));
    parts.push(P(box(0.05, 0.16, 0.05), trim, { t: [side * 0.07, 0.44, -0.06], r: [0, 0, side * 0.4] }));
    parts.push(P(box(0.04, 0.22, 0.10), body, { t: [side * 0.10, 0.62, 0.02], r: [0, 0, side * 0.25] }));
  }
  parts.push(P(icosahedron(0.07, 1), accent, { t: [0, 0.22, 0.20] }));
  parts.push(...eyes(accent, 0.06, 0.22, 0.24, 0.028));
  return parts;
};

const wisp = () => {
  const p = PALETTE.wisp;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const core = { t: [0, 0.62, 0] };
  const parts = [
    P(icosahedron(0.34, 3), body, { ...core, s: [1, 1.08, 1] }),
    P(icosahedron(0.15, 0), accent, { ...core, s: [1, 1.05, 1] }),
    P(torus(0.46, 0.035, 4, 14), accent, { ...core, r: [Math.PI / 2 - 0.5, 0, 0] }),
    P(cylinder(0.02, 0.09, 0.44, 8), body, { t: [0, 0.20, 0], r: [Math.PI, 0, 0] }),
    // Осколки на орбите: у голой сферы контур — круг, и на 13 пикселях она
    // не отличится от плоской плиты у mote, кроме высоты подвеса.
    ...[0, 1, 2].map((i) => P(icosahedron(0.08, 1), trim, {
      t: [Math.cos((i / 3) * TAU) * 0.46, 0.62 + Math.sin(i * 2.1) * 0.14, Math.sin((i / 3) * TAU) * 0.46],
    })),
  ];
  // Корона шипов вокруг ядра: у сферы без шипов силуэт — круг, а круг у
  // wisp должен отличаться от плоской плиты у mote только высотой подвеса.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * TAU;
    parts.push(P(cylinder(0, 0.05, 0.34, 6), trim, {
      t: [Math.cos(angle) * 0.30, 0.62 + Math.sin(i * 1.7) * 0.10, Math.sin(angle) * 0.30],
      r: [Math.sin(angle) * 0.9, 0, -Math.cos(angle) * 0.9],
    }));
  }
  parts.push(P(icosahedron(0.06, 1), accent, { t: [0, 0.90, 0] }));
  return parts;
};

const swarmling = () => {
  const p = PALETTE.swarmling;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    // Самое мелкое существо, и под него меньше всего места на экране: оболочка
    // и ноги набирают детализацию, а не масса, потому что масса тут не читается.
    P(icosahedron(0.19, 2), body, { t: [0, 0.48, 0.02], s: [0.9, 0.72, 1.15] }),
    P(icosahedron(0.10, 1), trim, { t: [0, 0.57, -0.09], s: [1, 0.7, 1] }),
    P(icosahedron(0.08, 1), trim, { t: [0, 0.42, 0.10], s: [1, 0.7, 1] }),
    ...spike(0, 0.48, 0.24, 0.20, 0.05, trim, [Math.PI / 2, 0, 0], 8),
    ...spike(0, 0.54, -0.20, 0.18, 0.04, trim, [-Math.PI / 2 - 0.5, 0, 0], 8),
  ];
  for (const side of [-1, 1]) {
    // Передняя пара длинная и тонкая, задняя короче: на 13 пикселях именно
    // разница длин ног отличает это существо от husk, у которого ноги короткие.
    parts.push(P(cylinder(0.02, 0.035, 0.44, 8), body, { t: [side * 0.12, 0.24, 0.02], r: [0, 0, -side * 0.14] }));
    parts.push(P(icosahedron(0.03, 1), trim, { t: [side * 0.11, 0.30, 0.02] }));
    parts.push(P(icosahedron(0.028, 1), trim, { t: [side * 0.11, 0.06, 0.02] }));
    parts.push(P(cylinder(0.015, 0.028, 0.26, 8), body, { t: [side * 0.10, 0.15, -0.13], r: [-0.4, 0, 0] }));
    parts.push(P(cylinder(0, 0.02, 0.24, 6), accent, { t: [side * 0.07, 0.60, 0.20], r: [Math.PI / 2 - 1.05, 0, 0] }));
  }
  parts.push(...eyes(accent, 0.05, 0.52, 0.14, 0.026));
  return parts;
};

const carapaceModel = () => {
  const p = PALETTE.carapace;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    P(cylinder(0.52, 0.68, 0.30, 12, { flat: true }), body, { t: [0, 0.15, -0.04], s: [1, 1, 1.1] }),
    P(icosahedron(0.50, 2), body, { t: [0, 0.60, -0.04], s: [1.28, 0.82, 1.40] }),
    P(cylinder(0.05, 0.13, 0.62, 6, { flat: true }), trim, { t: [0, 0.86, -0.06], r: [Math.PI / 2, 0, 0] }),
    // Плуг — единственный клинок, торчащий вперёд, и он же силуэтный признак
    // этой штуки: широкая база плюс то, за что цепляется взгляд. Длинный и
    // узкий, а не короткий широкий конус: у короткого он читается как пятно на
    // носу, а у длинного — как острие, и только острие говорит, куда идёт
    // существо.
    P(cylinder(0.09, 0.25, 0.62, 6, { flat: true }), accent, {
      t: [0, 0.30, 0.56], r: [Math.PI / 2 + 0.34, 0, 0],
    }),
    ...spike(0, 1.00, -0.06, 0.26, 0.08, accent, [Math.PI / 2, 0, 0], 7),
    P(box(0.34, 0.12, 0.20), trim, { t: [0, 0.62, -0.62] }),
    P(torus(0.62, 0.03, 4, 20), trim, { t: [0, 0.22, -0.04], r: [Math.PI / 2, 0, 0] }),
  ];
  for (const side of [-1, 1]) {
    parts.push(P(cylinder(0, 0.09, 0.44, 6, { flat: true }), trim, {
      t: [side * 0.34, 0.50, -0.48],
      r: [-Math.PI / 2 + 0.3, side * -0.34, 0],
    }));
    parts.push(...leg(side * 0.44, 0.22, 0.28, 0.22, 0.12, body, trim, side));
    parts.push(...leg(side * 0.44, 0.22, -0.30, 0.22, 0.12, body, trim, side));
    parts.push(P(box(0.14, 0.10, 0.18), trim, { t: [side * 0.52, 0.30, 0.28] }));
    parts.push(P(box(0.14, 0.10, 0.18), trim, { t: [side * 0.52, 0.30, -0.30] }));
    parts.push(...rivets([[side * 0.50, 0.56, 0.30], [side * 0.50, 0.56, -0.20]], 0.05, trim));
  }
  return parts;
};

const mote = () => {
  const p = PALETTE.mote;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    // Плита — единственная горизонтальная в росте, поэтому читается и как
    // диск, и как квадрат. Кольцо вокруг неё не годится: кольцо уже у wisp.
    P(cylinder(0.46, 0.46, 0.16, 18), body, { t: [0, 0.74, 0] }),
    P(cylinder(0.50, 0.44, 0.07, 18), trim, { t: [0, 0.64, 0] }),
    P(cylinder(0.30, 0.40, 0.10, 14), body, { t: [0, 0.66, 0] }),
    P(torus(0.47, 0.02, 4, 24), trim, { t: [0, 0.81, 0] }),
    P(cylinder(0.16, 0.24, 0.34, 10, { flat: true }), accent, { t: [0, 0.96, -0.02] }),
    P(cylinder(0.16, 0.26, 0.24, 10, { flat: true }), accent, { t: [0, 0.52, 0], r: [Math.PI, 0, 0] }),
    P(icosahedron(0.07, 2), accent, { t: [0, 0.86, 0.10] }),
  ];
  // Опоры под плитой: у плиты, висящей в воздухе, должен быть низ. Без них
  // существо читается как диск без тела, а это уже не существо.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * TAU + Math.PI / 4;
    parts.push(P(box(0.10, 0.16, 0.10), trim, {
      t: [Math.cos(angle) * 0.30, 0.58, Math.sin(angle) * 0.30],
      r: [0, -angle, 0],
    }));
    parts.push(P(cylinder(0.03, 0.04, 0.10, 8), body, {
      t: [Math.cos(angle) * 0.22, 0.71, Math.sin(angle) * 0.22],
    }));
    parts.push(P(icosahedron(0.035, 1), body, {
      t: [Math.cos(angle) * 0.38, 0.72, Math.sin(angle) * 0.38],
    }));
  }
  return parts;
};

const maw = () => {
  const p = PALETTE.maw;
  const body = metalTone(p.body);
  const trim = metalTone(p.trim);
  const accent = accentTone(p.accent);
  const parts = [
    P(cylinder(0.44, 0.52, 0.56, 8, { flat: true }), body, { t: [0, 0.50, -0.24], r: [0, Math.PI / 6, 0], s: [1.28, 1, 1.15] }),
    P(icosahedron(0.40, 2), body, { t: [0, 0.56, -0.30], s: [1.15, 0.8, 1.05] }),
  ];
  for (const z of [-0.56, -0.34, -0.12]) {
    parts.push(...spike(0, 0.82, z, 0.30, 0.09, trim, [0.2, 0, 0], 8));
  }
  // Раскрытая пасть: две плиты с зазором между ними и два ряда зубов. Зазор
  // держит силуэт, поэтому он задан числом, а не «примерно наклонено».
  parts.push(P(box(0.72, 0.16, 0.76), body, { t: [0, 0.74, 0.30], r: [0.36, 0, 0] }));
  parts.push(P(box(0.64, 0.14, 0.78), body, { t: [0, 0.18, 0.32], r: [0.28, 0, 0] }));
  parts.push(P(box(0.66, 0.10, 0.10), trim, { t: [0, 0.60, 0.50], r: [0.36, 0, 0] }));
  parts.push(P(box(0.58, 0.08, 0.10), trim, { t: [0, 0.28, 0.54], r: [0.28, 0, 0] }));
  for (const x of [-0.22, -0.11, 0, 0.11, 0.22]) {
    parts.push(P(cylinder(0, 0.035, 0.16, 4), accent, { t: [x, 0.50, 0.62], r: [Math.PI, 0, 0] }));
  }
  for (const x of [-0.18, -0.06, 0.06, 0.18]) {
    parts.push(P(cylinder(0, 0.032, 0.14, 4), accent, { t: [x, 0.34, 0.66] }));
  }
  for (const side of [-1, 1]) {
    for (const z of [0.22, -0.34]) {
      parts.push(P(cylinder(0.08, 0.12, 0.34, 8), body, { t: [side * 0.46, 0.22, z] }));
      parts.push(P(icosahedron(0.09, 1), trim, { t: [side * 0.46, 0.40, z] }));
      parts.push(P(box(0.20, 0.06, 0.22), trim, { t: [side * 0.48, 0.03, z] }));
    }
  }
  parts.push(P(box(0.26, 0.10, 0.20), trim, { t: [0, 0.74, -0.52] }));
  parts.push(...eyes(accent, 0.14, 0.70, 0.44, 0.05));
  return parts;
};

// Части раскладываются по двум мешам: корпус и акцент. Группа назначается по
// цвету, а не флагом на каждой части: правило «вершины этого цвета едут в
// узел, который клиент будет подсвечивать» не может разъехаться с разметкой,
// иначе акцент молча уехал бы в корпус и клиент не нашёл бы узел по имени.
const groupParts = (model, parts, accentColor) => {
  const groups = new Map();
  const sameColor = (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  for (const entry of parts) {
    const group = sameColor(entry.color, accentColor) ? model.accent : 'body';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ ...entry, group });
  }
  const order = ['body', model.accent];
  const meshes = [];
  for (const name of order) {
    const entries = groups.get(name);
    if (!entries) continue;
    meshes.push({ name, entries });
  }
  for (const name of groups.keys()) {
    if (!order.includes(name)) fail(`${model.id} uses unknown mesh group ${name}`);
  }
  if (meshes.length < MESH_BAND.min) fail(`${model.id} produced no meshes`);  if (meshes.length > MESH_BAND.max) {
    fail(`${model.id} has ${meshes.length} meshes, budget allows ${MESH_BAND.max}`);
  }
  return meshes;
};

// Модели описаны функциями, список — данными, а связаны они здесь: функции
// объявлены ниже по файлу, и `const` на то и `const`, что не поднимается.
const MODELS = MODEL_SPECS.map((spec) => ({
  ...spec,
  build: { husk, runner, wisp, swarmling, carapace: carapaceModel, mote, maw }[spec.id],
}));

// Акцент существа — тот же тон, что модель кладёт в свои части: раздельное
// объявление цвета в манифесте и в модели разъехалось бы при первой же правке
// палитры, и клиент подсветил бы не тот узел.
const accentOf = (model) => accentTone(PALETTE[model.id].accent);

// ---------- трансформ и посадка ----------

const applyTransform = (geo, entry) => {
  const [rx, ry, rz] = entry.r;
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
  const rotate = (x, y, z) => {
    // порядок XYZ, как у three: сначала X, потом Y, потом Z
    let nx = x, ny = y * cosX - z * sinX, nz = y * sinX + z * cosX;
    let mx = nx * cosY + nz * sinY, my = ny, mz = -nx * sinY + nz * cosY;
    const lx = mx * cosZ - my * sinZ, ly = mx * sinZ + my * cosZ, lz = mz;
    return [lx, ly, lz];
  };
  const scale = typeof entry.s === 'number' ? [entry.s, entry.s, entry.s] : entry.s;
  const p = [];
  const n = [];
  for (let i = 0; i < geo.p.length; i += 3) {
    const scaled = [geo.p[i] * scale[0], geo.p[i + 1] * scale[1], geo.p[i + 2] * scale[2]];
    const [x, y, z] = rotate(scaled[0], scaled[1], scaled[2]);
    p.push(x + entry.t[0], y + entry.t[1], z + entry.t[2]);
  }
  // Нормали при масштабе делятся на масштаб оси: без этого грани ящика
  // после неравномерного растяжения светятся не тем, чем задумано.
  for (let i = 0; i < geo.n.length; i += 3) {
    const [x, y, z] = rotate(geo.n[i] / scale[0], geo.n[i + 1] / scale[1], geo.n[i + 2] / scale[2]);
    const length = Math.hypot(x, y, z) || 1;
    n.push(x / length, y / length, z / length);
  }
  return { p, n, i: geo.i };
};

// Радиус считается по вершинам, а не по углам bbox: клиент меряет именно так,
// и угол пустого бокса у диска завышает радиус почти вдвое.
const bounds = (parts) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let footprint = 0;
  for (const part of parts) {
    const p = part.p;
    for (let i = 0; i < p.length; i += 3) {
      const x = part.p[i], y = part.p[i + 1], z = part.p[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      const r = Math.hypot(x, z);
      if (r > footprint) footprint = r;
    }
  }
  if (!Number.isFinite(minY)) fail('model has no geometry');
  return { minX, maxX, minY, maxY, minZ, maxZ, footprint };
};

// FIT. Ширина и высота из таблицы — точные числа, а исходная модель в них не
// попадает, поэтому масштаб по ширине и по высоте разный: иначе либо
// вылезем по одной из границ, либо окажемся ниже заданного. Глубина следует
// за шириной, чтобы силуэт не тянулся в плане.
//
// Посадка: минимум по Y уезжает на 0 (тело стоит на PATH_Y), а у парящих —
// на hoverY, иначе существо уедет в землю. Центр по X и Z в нуле.
const fit = (meshes, model) => {
  // Сначала локальные трансформы частей, и только потом замер: иначе пришлось бы
  // мерить по двум разным представлениям одной геометрии.
  const local = meshes.map((mesh) => ({
    ...mesh,
    entries: mesh.entries.map((entry) => ({ ...entry, ...applyTransform(entry.geo, entry) })),
  }));
  const box = bounds(local.flatMap((mesh) => mesh.entries));
  const srcWidth = box.maxX - box.minX;
  const srcHeight = box.maxY - box.minY;
  if (srcWidth <= 0 || srcHeight <= 0) fail(`${model.id} has a flat bounding box`);

  const sx = model.width / srcWidth;
  const sy = model.height / srcHeight;
  const sz = sx;
  const hoverY = model.hoverY ?? 0;
  const offsetX = -((box.minX + box.maxX) / 2) * sx;
  const offsetY = hoverY - box.minY * sy;
  const offsetZ = -((box.minZ + box.maxZ) / 2) * sz;

  const placed = local.map((mesh) => ({
    ...mesh,
    entries: mesh.entries.map((entry) => {
      const p = new Array(entry.p.length);
      for (let i = 0; i < entry.p.length; i += 3) {
        p[i] = round(entry.p[i] * sx + offsetX);
        p[i + 1] = round(entry.p[i + 1] * sy + offsetY);
        p[i + 2] = round(entry.p[i + 2] * sz + offsetZ);
      }
      const n = new Array(entry.n.length);
      for (let i = 0; i < entry.n.length; i += 3) {
        let x = entry.n[i] / sx, y = entry.n[i + 1] / sy, z = entry.n[i + 2] / sz;
        const length = Math.hypot(x, y, z) || 1;
        n[i] = round(x / length);
        n[i + 1] = round(y / length);
        n[i + 2] = round(z / length);
      }
      return { ...entry, p, n };
    }),
  }));

  const check = bounds(placed.flatMap((mesh) => mesh.entries));
  if (Math.abs(check.minY - hoverY) > 1e-4) {
    fail(`${model.id} sits at ${round(check.minY)}, expected ${hoverY}`);
  }
  if (Math.abs((check.maxX - check.minX) - model.width) > 1e-3) {
    fail(`${model.id} is ${round(check.maxX - check.minX)} wide, target is ${model.width}`);
  }
  if (Math.abs((check.maxY - check.minY) - model.height) > 1e-3) {
    fail(`${model.id} is ${round(check.maxY - check.minY)} tall, target is ${model.height}`);
  }
  if (check.maxY > MODEL_BUDGET.height) {
    fail(`${model.id} is ${round(check.maxY)} tall, model budget allows ${MODEL_BUDGET.height}`);
  }
  if (check.footprint > MODEL_BUDGET.footprintRadius) {
    fail(
      `${model.id} has footprint radius ${round(check.footprint)}, budget allows ` +
        `${MODEL_BUDGET.footprintRadius}. Треугольник не правит, это размер модели`,
    );
  }
  return { placed, sx, sy, sz };
};

// ---------- запись GLB ----------

// Гейт полосы треугольников отключается только режимом `--count`: он нужен,
// чтобы увидеть счётчики всех семи сразу, а не падать на первом.
let enforceBand = true;

const buildGlb = (model, meshes) => {
  const binParts = [];
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const nodes = [];
  let binLength = 0;
  let triangles = 0;

  const appendView = (data, target) => {
    const padding = (4 - (binLength % 4)) % 4;
    if (padding > 0) {
      binParts.push(Buffer.alloc(padding));
      binLength += padding;
    }
    const byteOffset = binLength;
    binParts.push(data);
    binLength += data.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length, ...(target === undefined ? {} : { target }) });
    return bufferViews.length - 1;
  };

  const vectorBounds = (values, components) => {
    const min = new Array(components).fill(Infinity);
    const max = new Array(components).fill(-Infinity);
    values.forEach((value, index) => {
      const axis = index % components;
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    });
    return { min: min.map(round), max: max.map(round) };
  };

  const floatAccessor = (values, type) => {
    const components = { VEC3: 3, VEC4: 4 }[type];
    if (components === undefined || values.length === 0 || values.length % components !== 0) {
      fail(`model ${model.id} has a buffer that is not a non-empty ${type} list`);
    }
    return (
      accessors.push({
        bufferView: appendView(Buffer.from(new Float32Array(values).buffer), TARGET_ARRAY_BUFFER),
        byteOffset: 0,
        componentType: COMPONENT_FLOAT,
        count: values.length / components,
        type,
        ...vectorBounds(values, components),
      }) - 1
    );
  };

  const indexAccessor = (indices, vertexCount) => {
    if (indices.length === 0 || indices.length % 3 !== 0) {
      fail(`model ${model.id} has an index buffer that is not a whole number of triangles`);
    }
    let min = Infinity, max = -Infinity;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        fail(`model ${model.id} references vertex ${index} outside ${vertexCount} vertices`);
      }
      if (index < min) min = index;
      if (index > max) max = index;
    }
    if (vertexCount > 65536) fail(`model ${model.id} exceeds the UNSIGNED_SHORT index range`);
    triangles += indices.length / 3;
    return (
      accessors.push({
        bufferView: appendView(Buffer.from(new Uint16Array(indices).buffer), TARGET_ELEMENT_ARRAY_BUFFER),
        byteOffset: 0,
        componentType: COMPONENT_UNSIGNED_SHORT,
        count: indices.length,
        type: 'SCALAR',
        min: [min],
        max: [max],
      }) - 1
    );
  };

  let accentTriangles = 0;
  for (const mesh of meshes) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    for (const entry of mesh.entries) {
      const base = positions.length / 3;
      for (let i = 0; i < entry.p.length; i += 3) {
        positions.push(entry.p[i], entry.p[i + 1], entry.p[i + 2]);
        normals.push(entry.n[i], entry.n[i + 1], entry.n[i + 2]);
        colors.push(entry.color[0], entry.color[1], entry.color[2], 1);
      }
      for (let i = 0; i < entry.i.length; i += 1) indices.push(entry.i[i] + base);
      if (mesh.name === model.accent) accentTriangles += entry.i.length / 3;
    }
    const attributes = {
      POSITION: floatAccessor(positions, 'VEC3'),
      NORMAL: floatAccessor(normals, 'VEC3'),
      COLOR_0: floatAccessor(colors, 'VEC4'),
    };
    const index = indexAccessor(indices, positions.length / 3);
    gltfMeshes.push({ name: `${mesh.name}-mesh`, primitives: [{ attributes, indices: index, mode: MODE_TRIANGLES }] });
    nodes.push({ name: mesh.name, mesh: gltfMeshes.length - 1 });
  }

  if (enforceBand && (triangles < TRIANGLE_BAND.min || triangles > TRIANGLE_BAND.max)) {
    fail(
      `model ${model.id} has ${triangles} triangles, the band is ` +
        `${TRIANGLE_BAND.min}–${TRIANGLE_BAND.max}. Больше верхней границы — это запрос на LOD`,
    );
  }
  if (enforceBand && accentTriangles / triangles > ACCENT_SHARE) {
    fail(
      `model ${model.id}: ${model.accent} holds ${Math.round((accentTriangles / triangles) * 100)}% of the ` +
        `triangles, budget allows ${Math.round(ACCENT_SHARE * 100)}%. Клиент поднимает эмиссию на этом узле`,
    );
  }

  const gltf = {
    asset: { version: '2.0', generator: 'nexus-defense/export-echoes-enemies' },
    scene: 0,
    // Все узлы — корни сцены: узел вне графа сцены не попадает в загруженное
    // дерево, и клиент не найдёт акцент по имени (ровно тот отказ, что стоил
    // правки в NDD-0001).
    scenes: [{ name: model.id, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binBytes = Buffer.concat(binParts);
  const binChunk = Buffer.concat([binBytes, Buffer.alloc((4 - (binBytes.length % 4)) % 4)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(GLB_MAGIC, 0);
  glb.writeUInt32LE(GLB_VERSION, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(CHUNK_JSON, 16);
  jsonChunk.copy(glb, 20);
  const binHeader = 20 + jsonChunk.length;
  glb.writeUInt32LE(binChunk.length, binHeader);
  glb.writeUInt32LE(CHUNK_BIN, binHeader + 4);
  binChunk.copy(glb, binHeader + 8);
  return { bytes: glb, triangles };
};

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// ---------- проверка того, что записано ----------

const readGltf = (bytes, label) => {
  if (bytes.length < 12 || bytes.readUInt32LE(0) !== GLB_MAGIC) fail(`${label}: bad GLB magic`);
  if (bytes.readUInt32LE(4) !== GLB_VERSION) fail(`${label}: unsupported GLB version`);
  if (bytes.readUInt32LE(8) !== bytes.length) fail(`${label}: header length disagrees with the file`);
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== CHUNK_JSON) fail(`${label}: first chunk is not JSON`);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  return { json };
};

const verifyGlb = (bytes, entry) => {
  const label = entry.file;
  if (bytes.length !== entry.bytes) fail(`${label}: size differs from the manifest`);
  if (sha256(bytes) !== entry.contentHash) fail(`${label}: content hash differs from the manifest`);
  const { json } = readGltf(bytes, label);

  if (json.asset?.version !== '2.0') fail(`${label}: asset.version must be 2.0`);
  if (json.materials !== undefined) fail(`${label}: materials are not allowed in this pipeline`);
  if (json.textures !== undefined || json.images !== undefined) fail(`${label}: textures are not allowed`);
  if (json.skins !== undefined) fail(`${label}: skeleton is not allowed, animation is applied by the client`);
  if (json.animations !== undefined) fail(`${label}: clips are not allowed without a skeleton`);

  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  for (const node of nodes) {
    if (node.mesh === undefined && (node.children?.length ?? 0) === 0) {
      fail(`${label}: node ${node.name} has neither a mesh nor children, it would load as Object3D`);
    }
  }
  if (nodes.length > MODEL_BUDGET.nodes) fail(`${label}: ${nodes.length} nodes, budget ${MODEL_BUDGET.nodes}`);
  if (meshes.length > MESH_BAND.max) fail(`${label}: ${meshes.length} meshes, budget ${MESH_BAND.max}`);
  if (meshes.length < MESH_BAND.min) fail(`${label}: no meshes`);

  let triangles = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives) {
      const attributes = primitive.attributes ?? {};
      if (attributes.COLOR_0 === undefined) {
        fail(`${label}: a primitive has no COLOR_0, color must be per vertex`);
      }
      if (attributes.POSITION === undefined || attributes.NORMAL === undefined) {
        fail(`${label}: a primitive needs POSITION and NORMAL`);
      }
      if (primitive.material !== undefined) fail(`${label}: primitives must not reference a material`);
      if ((primitive.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES) fail(`${label}: mode must be TRIANGLES`);
      const indices = json.accessors[primitive.indices];
      if (indices === undefined) fail(`${label}: primitive has no index accessor`);
      triangles += indices.count / 3;
    }
  }
  if (triangles !== entry.triangles) {
    fail(`${label}: ${triangles} triangles in the file, manifest claims ${entry.triangles}`);
  }
  if (triangles > MODEL_BUDGET.triangles) fail(`${label}: ${triangles} triangles, budget ${MODEL_BUDGET.triangles}`);
  if (bytes.length > MODEL_BUDGET.bytes) fail(`${label}: ${bytes.length} bytes, budget ${MODEL_BUDGET.bytes}`);
  if (!nodes.some((node) => node.name === entry.emissiveNode)) {
    fail(`${label}: no node named ${entry.emissiveNode}`);
  }
  const roots = (json.scenes ?? [])[0]?.nodes ?? [];
  const reachable = new Set();
  const walk = (index) => {
    if (reachable.has(index)) return;
    reachable.add(index);
    for (const child of nodes[index]?.children ?? []) walk(child);
  };
  for (const root of roots) walk(root);
  for (let index = 0; index < nodes.length; index += 1) {
    if (!reachable.has(index)) fail(`${label}: node ${nodes[index].name} is not reachable from the scene`);
  }
  if (!roots.length) fail(`${label}: the scene has no root nodes`);
  return { triangles, nodes: nodes.length, meshes: meshes.length };
};

// ---------- манифест ----------

// Записи башен из NDD-0001 не переписываются: манифест дополняется. Штаб
// сверяет `bytes` и `contentHash` всех моделей, поэтому чужие строки должны
// уйти в выгрузку ровно теми же, что лежат на диске.
const TOWER_IDS = ['pulse-spire', 'grove-lens', 'frost-relay'];

const readTowerEntries = () => {
  const path = join(OUT_DIR, 'manifest.json');
  if (!existsSync(path)) {
    fail(`missing ${path}: NDD-0001 must be built first, its tower entries are carried over`);
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.version !== 1) fail('manifest version must be 1');
  const kept = manifest.models.filter((model) => TOWER_IDS.includes(model.id));
  if (kept.length !== TOWER_IDS.length) {
    fail(`manifest lists ${kept.length} of ${TOWER_IDS.length} tower entries, NDD-0001 output is incomplete`);
  }
  // Модели башен должны лежать на диске целыми, иначе дописанный манифест
  // разъедется с ними и штаб получит отказ на ровном месте.
  for (const entry of kept) {
    const path2 = join(OUT_DIR, entry.file);
    if (!existsSync(path2)) fail(`tower model ${entry.file} is missing from the export directory`);
    const bytes = readFileSync(path2);
    if (bytes.length !== entry.bytes) fail(`tower model ${entry.file} size differs from the manifest`);
    if (sha256(bytes) !== entry.contentHash) fail(`tower model ${entry.file} hash differs from the manifest`);
  }
  return kept;
};

// ---------- сборка ----------

const buildOne = (model) => {
  const parts = model.build();
  const meshes = groupParts(model, parts, accentOf(model));
  const { placed, sx, sy, sz } = fit(meshes, model);
  const { bytes, triangles } = buildGlb(model, placed);

  // Второй build того же описания обязан дать те же байты: иначе хеш в
  // манифесте ничего не значит, а пересборка выглядит как правка модели.
  const repeat = groupParts(model, model.build(), accentOf(model));
  const { placed: placedAgain } = fit(repeat, model);
  const { bytes: bytesAgain } = buildGlb(model, placedAgain);
  if (!bytesAgain.equals(bytes)) fail(`${model.id} is not deterministic: two builds differ`);

  const entry = {
    id: model.id,
    file: `${model.id}.glb`,
    bytes: bytes.length,
    contentHash: sha256(bytes),
    triangles,
    emissiveNode: model.accent,
  };
  if (model.hoverY !== undefined) entry.hoverY = model.hoverY;
  verifyGlb(bytes, entry);
  return { model, entry, bytes, placed, scale: { sx, sy, sz } };
};

const build = () => {
  const towers = readTowerEntries();
  const results = MODELS.map(buildOne);
  const entries = [...towers, ...results.map((result) => result.entry)];

  if (entries.length > REGISTRY_BUDGET.models) fail(`registry lists ${entries.length} models`);
  const registryBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (registryBytes > REGISTRY_BUDGET.bytes) fail(`registry is ${registryBytes} bytes`);
  const registryTriangles = entries.reduce((sum, entry) => sum + entry.triangles, 0);
  if (registryTriangles > REGISTRY_BUDGET.triangles) {
    fail(`registry is ${registryTriangles} triangles, budget ${REGISTRY_BUDGET.triangles}`);
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) fail('registry repeats an id');
  // Волна — предел по числу вызовов отрисовки, а не по треугольникам: 16
  // существ × 2 меша плюс башни сцены. Считается здесь, а не в отчёте.
  const waveDrawCalls = results.length ? 16 * results[0].placed.length : 0;
  if (waveDrawCalls > SCENE_DRAWCALL_SHARE) {
    fail(`a wave of 16 needs ${waveDrawCalls} draw calls, the scene share allows ${SCENE_DRAWCALL_SHARE}`);
  }
  return { entries, results, towers, registryBytes, registryTriangles, waveDrawCalls };
};

// Доля бюджета сцены, которую может занять волна. Их SCENE_BUDGET.drawCalls
// — 400 на всю сцену; 96 оставляем башням и рендеру карты.
const SCENE_DRAWCALL_SHARE = 96;

const check = () => {
  const manifestPath = join(OUT_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) fail(`missing ${manifestPath}: run without --check first`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1) fail('manifest version must be 1');
  for (const entry of manifest.models) {
    const bytes = readFileSync(join(OUT_DIR, entry.file));
    const read = verifyGlb(bytes, entry);
    console.log(
      `${entry.id}: ${entry.file} ${entry.bytes} bytes, ${read.triangles} tris, ` +
        `${read.nodes} nodes, ${read.meshes} meshes` +
        (entry.hoverY === undefined ? '' : `, hoverY ${entry.hoverY}`),
    );
  }
  const total = manifest.models.reduce((sum, entry) => sum + entry.triangles, 0);
  const totalBytes = manifest.models.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`registry: ${manifest.models.length} models, ${total} triangles, ${totalBytes} bytes · budget ${REGISTRY_BUDGET.triangles}`);
  console.log('assets: ok (--check)');
};

const main = () => {
  // --count печатает счётчики всех семи и ничего не пишет на диск: гейт
  // полосы и гейт доли акцента на время счёта снимаются.
  const mode = process.argv[2] ?? '--write';
  if (!['--write', '--check', '--count'].includes(mode)) fail(`unknown mode ${mode}`);
  if (mode === '--check') {
    check();
    return;
  }
  if (mode === '--count') {
    enforceBand = false;
    for (const model of MODELS) {
      const meshes = groupParts(model, model.build(), accentOf(model));
      const { placed } = fit(meshes, model);
      const { triangles } = buildGlb(model, placed);
      const box = bounds(placed.flatMap((mesh) => mesh.entries));
      let accent = 0;
      for (const mesh of placed) {
        if (mesh.name !== model.accent) continue;
        for (const entry of mesh.entries) accent += entry.i.length / 3;
      }
      console.log(
        `${model.id.padEnd(11)} ${String(triangles).padStart(5)} tris  ` +
          `accent ${String(Math.round((accent / triangles) * 100)).padStart(3)}%  ` +
          `${round(box.maxX - box.minX)}×${round(box.maxY - box.minY)}×${round(box.maxZ - box.minZ)}  ` +
          `pivotY ${round(box.minY)}  footprint ${round(box.footprint)}  meshes ${placed.length}`,
      );
    }
    return;
  }
  const { entries, results, registryBytes, registryTriangles, waveDrawCalls } = build();
  for (const result of results) {
    writeFileSync(join(OUT_DIR, result.entry.file), result.bytes);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify({ version: 1, models: entries }, null, 2)}\n`);

  for (const result of results) {
    const { model, entry, placed, scale } = result;
    const box = bounds(placed.flatMap((mesh) => mesh.entries));
    const depth = round(box.maxZ - box.minZ);
    const meshNames = placed.map((mesh) => mesh.name).join(', ');
    console.log(
      `${entry.id}: ${entry.file}, ${entry.bytes} bytes, ${entry.triangles} tris, ` +
        `${round(box.maxX - box.minX)}×${round(box.maxY - box.minY)}×${depth}, ` +
        `pivotY ${round(box.minY)}, footprint ${round(box.footprint)}, ` +
        `scale ${round(scale.sx)}/${round(scale.sy)}/${round(scale.sz)}, nodes ${meshNames}` +
        (entry.hoverY === undefined ? '' : `, hoverY ${entry.hoverY}`),
    );
  }
  console.log(`registry: ${entries.length} models, ${registryTriangles} triangles, ${registryBytes} bytes`);
  console.log(`wave: 16 creatures · ${waveDrawCalls} draw calls from creatures · rest is towers and map`);
  console.log('assets: ok (--write)');
};

try {
  main();
} catch (error) {
  if (process.env.ECHOES_TRACE) {
    console.error(error instanceof Error ? error.stack : String(error));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
