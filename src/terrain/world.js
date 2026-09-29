import * as THREE from 'three';
import { Simplex, makeRng, clamp, smoothstep, mix, mixColor } from './noise.js';

/* Мир: рельеф, дорога, биомы.
   Всё считается в CPU в виде сеток — так логика биомов остаётся в JS,
   где её легко крутить, а шейдер только домешивает детали. */

export const WORLD = 200;          // размер мира в мировых единицах
export const RES = 220;            // разрешение сетки рельефа
export const STEP = WORLD / (RES - 1);
/* Уровень жидкости = верхняя граница её биома.
   Если опустить уровень ниже границы (как было: -8 при биоме от -7.5),
   поверхность оказывается НИЖЕ собственного дна и озеро не рисуется
   вовсе — только лоскут на самом глубоком месте. */
export const WATER_LEVEL = 1.2;    // вода
export const TOXIC_LEVEL = -3.0;   // ядовитая жижа
export const LAVA_LEVEL = -7.5;    // лавовое озеро

export const BIOME = {
  GRASS: 0, FOREST: 1, ROCK: 2, SAND: 3, SNOW: 4,
  WATER: 5, TOXIC: 6, LAVA: 7, ASH: 8, ROAD: 9, CRYSTAL: 10
};

export const BIOME_INFO = {
  [BIOME.GRASS]:   { name: 'Трава',        color: 0x3f6b3a, desc: 'Основной покров. Ровный, проходимый, даёт камуфляж технике.' },
  [BIOME.FOREST]:  { name: 'Лес',          color: 0x24422a, desc: 'Плотные заросли. Замедляет наземных, прячет врагов от башен.' },
  [BIOME.ROCK]:    { name: 'Скалы',        color: 0x5a5f66, desc: 'Камень. Непроходимо, чинит урон от наземных по склону.' },
  [BIOME.SAND]:    { name: 'Песок',        color: 0x8a7a52, desc: 'Побережье. Быстро сохнет, медленно горит.' },
  [BIOME.SNOW]:    { name: 'Снег',         color: 0xc8d6e0, desc: 'Вершины. Отражает свет, враги теряют преимущество.' },
  [BIOME.WATER]:   { name: 'Вода',         color: 0x1d4a6e, desc: 'Озёра. Наземные не проходят, летающие — да.' },
  [BIOME.TOXIC]:   { name: 'Ядовитая жижа', color: 0x4a7a1e, desc: 'Сбросы. Кислотный туман даёт урон всем, кто стоит.' },
  [BIOME.LAVA]:    { name: 'Лавовое озеро', color: 0xff5a1e, desc: 'Расплав. Убивает мгновенно, но выделяет свет и тепло.' },
  [BIOME.ASH]:     { name: 'Пепел',        color: 0x5a4a3e, desc: 'Выжженная земля. Пусто, но сбивает оптику башен.' },
  [BIOME.ROAD]:    { name: 'Дорога',       color: 0x2a2f36, desc: 'Твёрдое полотно. Единственный маршрут наземных.' },
  [BIOME.CRYSTAL]: { name: 'Кристаллы',    color: 0x7a5ad0, desc: 'Редкий металл. Усиливает радиус башен рядом.' }
};

/* ---------- дорога: сплайн по опорным точкам ---------- */
export function buildPath(rng) {
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(new THREE.Vector3(
      (t - 0.5) * WORLD * 0.92,
      0,
      (rng() - 0.5) * WORLD * 0.62
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const samples = 320;
  const flat = [];
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPoint(i / samples);
    flat.push(p);
  }
  return { curve, flat, width: 3.2 };
}

/* расстояние до ломаной дороги + параметр вдоль неё (для бордюрных лент) */
function pathField(x, z, path) {
  let best = 1e9, bestT = 0;
  const f = path.flat;
  for (let i = 0; i < f.length; i++) {
    const dx = x - f[i].x, dz = z - f[i].z;
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bestT = i / (f.length - 1); }
  }
  return { d: Math.sqrt(best), t: bestT };
}

/* ---------- генерация ---------- */
export function generateWorld(seed = 20260928) {
  const rng = makeRng(seed);
  const sx = new Simplex(() => rng());
  const path = buildPath(makeRng(seed ^ 0x9e37));

  const H = new Float32Array(RES * RES);      // высота
  const B = new Uint8Array(RES * RES);       // биом
  const M = new Float32Array(RES * RES);      // влажность/aux
  const D = new Float32Array(RES * RES);      // расстояние до дороги

  const half = WORLD / 2;
  const idx = (i, j) => j * RES + i;

  /* --- базовый рельеф: равнина + горная гряда на севере --- */
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = i * STEP - half;
      const z = j * STEP - half;

      const [wx, wz] = sx.warp(x * 0.006, z * 0.006, 1.4);
      let h = sx.fbm(wx, wz, 6) * 0.5 + 0.5;          // 0..1

      /* горная гряда: маска по z, гребневой шум */
      const ridgeMask = smoothstep(0.05, 0.75, (-z + half) / WORLD);
      const ridge = sx.ridged(x * 0.009 + 11, z * 0.009 + 3, 6);
      h = mix(h, h * 0.35 + ridge * 1.15, ridgeMask * 0.9);

      /* ВАЖНО: сначала переводим в мировые единицы, и только потом
         вычитаем впадины. Раньше смещения в мировых единицах вычитались
         из нормализованной высоты и потом домножались на 16 — диапазон
         разъезжался до ±145 единиц. */
      h *= 14;

      /* Три независимых бассейна под три типа жидкости.
         Разные частоты и смещения, чтобы карманы не накладывались:
         вода — широкая мелкая, яд — локальные глубокие, лава — гряд. */
      const basin = sx.fbm(x * 0.0045 + 31, z * 0.0045 - 17, 3);
      const basinMask = smoothstep(0.0, 0.28, -basin);
      h -= basinMask * 6.5;

      const toxBand = sx.fbm(x * 0.0072 + 91, z * 0.0072 + 55, 3);
      const toxMask = smoothstep(0.30, 0.54, toxBand);
      h -= toxMask * 12.0;

      const lavBand = sx.fbm(x * 0.0061 - 8, z * 0.0061 + 44, 3);
      const lavMask = smoothstep(0.34, 0.56, lavBand) * smoothstep(0.5, 0.12, ridgeMask);
      h -= lavMask * 18.0;

      /* края мира — пологий подъём вместо стены */
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      h += smoothstep(0.86, 1.0, edge) * 6;

      H[idx(i, j)] = h;
    }
  }

  /* --- дорога: выравниваем рельеф вдоль полотна --- */
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = i * STEP - half;
      const z = j * STEP - half;
      const { d, t } = pathField(x, z, path);
      D[idx(i, j)] = d;
      if (d < path.width * 1.7) {
        const prof = path.flat[Math.round(t * (path.flat.length - 1))].y;
        const k = 1 - smoothstep(path.width * 0.5, path.width * 1.7, d);
        H[idx(i, j)] = mix(H[idx(i, j)], prof + 0.12, k * .92);
      }
    }
  }
  /* профиль высоты вдоль дороги — сглаживаем, чтобы не было ступенек,
     и зажимаем выше уровня воды: иначе дорога тонет и в озере видны дыры */
  for (let s = 0; s < path.flat.length; s++) {
    const p = path.flat[s];
    const i = Math.round((p.x + half) / STEP);
    const j = Math.round((p.z + half) / STEP);
    if (i >= 0 && i < RES && j >= 0 && j < RES) path.flat[s].y = H[idx(i, j)];
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let s = 1; s < path.flat.length - 1; s++) {
      path.flat[s].y = (path.flat[s - 1].y + path.flat[s].y * 2 + path.flat[s + 1].y) * .25;
    }
  }
  /* дорога не должна проваливаться под воду — это насыпь/мост */
  for (let s = 0; s < path.flat.length; s++) {
    path.flat[s].y = Math.max(path.flat[s].y, WATER_LEVEL + 0.9);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 1; s < path.flat.length - 1; s++) {
      path.flat[s].y = (path.flat[s - 1].y + path.flat[s].y * 2 + path.flat[s + 1].y) * .25;
    }
    for (let s = 0; s < path.flat.length; s++) {
      path.flat[s].y = Math.max(path.flat[s].y, WATER_LEVEL + 0.9);
    }
  }
  /* перекладываем рельеф под новый профиль */
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = i * STEP - half;
      const z = j * STEP - half;
      const { d, t } = pathField(x, z, path);
      if (d < path.width * 1.7) {
        const prof = path.flat[Math.round(t * (path.flat.length - 1))].y;
        const k = 1 - smoothstep(path.width * 0.5, path.width * 1.7, d);
        H[idx(i, j)] = mix(H[idx(i, j)], prof + 0.12, k * .92);
      }
    }
  }

  /* --- биомы --- */
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = i * STEP - half;
      const z = j * STEP - half;
      const h = H[idx(i, j)];
      const d = D[idx(i, j)];
      const moist = sx.fbm(x * 0.011 + 7, z * 0.011 - 3, 4) * 0.5 + 0.5;
      const heat = sx.fbm(x * 0.008 - 21, z * 0.008 + 13, 4) * 0.5 + 0.5;
      M[idx(i, j)] = moist;

      let b;
      /* порядок важен: сначала опасные низины, потом вода, потом суша.
         Раньше вода перехватывала всё ниже WATER_LEVEL, и лава с ядом
         не появлялись как биомы вовсе. */
      if (d < path.width * 0.5) b = BIOME.ROAD;
      else if (h < LAVA_LEVEL) b = BIOME.LAVA;
      else if (h < TOXIC_LEVEL && moist > 0.38) b = BIOME.TOXIC;
      else if (h < WATER_LEVEL) b = BIOME.WATER;
      else if (h < WATER_LEVEL + 0.7) b = BIOME.SAND;
      else if (h > 14) b = BIOME.SNOW;
      else if (h > 9.5) b = BIOME.ROCK;
      else if (heat > 0.66 && moist < 0.42) b = BIOME.ASH;
      else if (moist > 0.56) b = BIOME.FOREST;
      else b = BIOME.GRASS;

      /* кристаллы — редкие пятна на склонах */
      if (b === BIOME.ROCK && sx.fbm(x * 0.05 + 77, z * 0.05 - 5, 2) > 0.42) b = BIOME.CRYSTAL;

      B[idx(i, j)] = b;
    }
  }

  /* сглаживание биомов — убирает шум в одиноких клетках */
  const Bs = new Uint8Array(B);
  for (let j = 1; j < RES - 1; j++) {
    for (let i = 1; i < RES - 1; i++) {
      const counts = {};
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const v = B[idx(i + di, j + dj)];
          counts[v] = (counts[v] || 0) + (di === 0 && dj === 0 ? 3 : 1);
        }
      }
      let best = B[idx(i, j)], bestN = -1;
      for (const [v, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = +v; }
      Bs[idx(i, j)] = best;
    }
  }
  B.set(Bs);

  /* Уровни жидкостей ВЫВОДИМ ИЗ ДАННЫХ, а не задаём константами.
     Сглаживание биомов размазывает границу, и клетка в котловине может
     оказаться чуть выше объявленного порога. Берём максимум высот по
     клеткам биома — тогда поверхность гарантированно выше собственного
     дна, и озеро заливает всю свою область, а не лоскут. */
  const levels = { water: -Infinity, toxic: -Infinity, lava: -Infinity };
  const key = { [BIOME.WATER]: 'water', [BIOME.TOXIC]: 'toxic', [BIOME.LAVA]: 'lava' };
  for (let n = 0; n < B.length; n++) {
    const k = key[B[n]];
    if (k && H[n] > levels[k]) levels[k] = H[n];
  }
  for (const k in levels) {
    if (!isFinite(levels[k])) levels[k] = 0;
    levels[k] += 0.2;
  }

  return { seed, H, B, M, D, path, levels, RES, STEP, WORLD, idx, sx, rng };
}

/* ---------- цвета биомов ---------- */
/* грунт под лавой и ядом — тёмный базальт и ил. Иначе поверхность
   жидкости сливается по цвету с землёй и не читается как расплав. */
const COL = {
  [BIOME.GRASS]:   [0.16, 0.30, 0.15],
  [BIOME.FOREST]:  [0.09, 0.20, 0.11],
  [BIOME.ROCK]:    [0.30, 0.32, 0.35],
  [BIOME.SAND]:    [0.46, 0.40, 0.26],
  [BIOME.SNOW]:    [0.74, 0.82, 0.88],
  [BIOME.WATER]:   [0.06, 0.16, 0.26],
  [BIOME.TOXIC]:   [0.07, 0.11, 0.04],
  [BIOME.LAVA]:    [0.05, 0.025, 0.02],
  [BIOME.ASH]:     [0.13, 0.11, 0.10],
  [BIOME.ROAD]:    [0.14, 0.16, 0.19],
  [BIOME.CRYSTAL]: [0.26, 0.20, 0.42]
};

export function biomeColor(b) { return COL[b] || COL[BIOME.GRASS]; }

/* ---------- меш рельефа ---------- */
export function buildTerrainMesh(world) {
  const { H, B, M, RES, STEP, idx } = world;
  const half = WORLD / 2;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, RES - 1, RES - 1);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(RES * RES * 3);
  const heights = new Float32Array(RES * RES);

  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const n = idx(i, j);
      pos.setY(n, H[n]);
      heights[n] = H[n];
      const c = biomeColor(B[n]);
      /* лёгкая вариация по высоте, чтобы не было плоской заливки */
      const v = 0.85 + M[n] * 0.3;
      colors[n * 3] = clamp(c[0] * v, 0, 1);
      colors[n * 3 + 1] = clamp(c[1] * v, 0, 1);
      colors[n * 3 + 2] = clamp(c[2] * v, 0, 1);
    }
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.06, flatShading: false
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, heights };
}

/* ---------- текстура высот для шейдеров воды/лавы ---------- */
/* Строки текстуры пишем в обратном порядке.
   PlaneGeometry после rotateX(-π/2) отображает локальный y в мировой -z,
   поэтому v=0 у геометрии соответствует z = +WORLD/2, а у DataTexture
   первая строка данных — это z = -WORLD/2. Без разворота шейдеры
   семплят высоту и маску владения зеркально по Z: вода «примерно»
   совпадает, а лава и яд не находятся вообще. */
export function buildHeightTexture(world) {
  const { H, RES, idx } = world;
  const data = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) data[idx(i, RES - 1 - j)] = H[idx(i, j)];
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* ---------- текстура биома для шейдеров ----------
   Без неё шейдеры жидкостей решают «где я» по одной высоте — и заливают
   друг друга. Маска отдаёт шейдеру точный id биома в каждой точке. */
export function buildBiomeTexture(world) {
  const { B, RES, idx } = world;
  const data = new Uint8Array(RES * RES);
  for (let n = 0; n < B.length; n++) data[n] = B[n];
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* ---------- маска владения жидкостями ----------
   Nearest-семплинг маски биомов давал ступенчатый берег. Здесь кладём
   в текстуру ИДЕНТИФИКАТОР ВЛАДЕЛЬЦА (0 — нет, 1 — вода, 2 — яд, 3 — лава)
   с линейной фильтрацией: край получается мягким, а шейдер по-прежнему
   знает, чья это жидкость, и жидкости не заливают друг друга. */
export const OWN_NONE = 0, OWN_WATER = 1, OWN_TOXIC = 2, OWN_LAVA = 3;

export function buildOwnershipTexture(world) {
  const { B, RES, idx } = world;
  const data = new Uint8Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const b = B[idx(i, j)];
      /* тот же разворот по Z, что и в buildHeightTexture */
      const n = idx(i, RES - 1 - j);
      data[n] = b === BIOME.WATER ? OWN_WATER
              : b === BIOME.TOXIC ? OWN_TOXIC
              : b === BIOME.LAVA  ? OWN_LAVA
              : OWN_NONE;
    }
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* ---------- поиск крупнейшего кластера биома ----------
   Точки обзора строим по реальным координатам кластеров, а не по
   захардкоженным точкам: рельеф каждый раз разный, и фиксированная
   камера регулярно встаёт носом в дерево. */
export function findBiomeCenter(world, biome, bucket = 12) {
  const { B, H, RES, STEP, idx } = world;
  const half = WORLD / 2;
  const nb = Math.ceil(WORLD / bucket);
  const counts = new Int32Array(nb * nb);
  const sumY = new Float32Array(nb * nb);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      if (B[idx(i, j)] !== biome) continue;
      /* мировая координата: i*STEP - half, затем сдвигаем в 0..WORLD */
      const wx = i * STEP - half + half;
      const wz = j * STEP - half + half;
      const bi = Math.min(nb - 1, Math.max(0, Math.floor(wx / bucket)));
      const bj = Math.min(nb - 1, Math.max(0, Math.floor(wz / bucket)));
      const k = bj * nb + bi;
      counts[k]++;
      sumY[k] += H[idx(i, j)];
    }
  }
  let best = -1, bestN = 0;
  for (let k = 0; k < counts.length; k++) {
    if (counts[k] > bestN) { bestN = counts[k]; best = k; }
  }
  if (best < 0 || bestN < 6) return null;
  const bi = best % nb, bj = (best / nb) | 0;
  return {
    x: bi * bucket + bucket / 2 - half,
    z: bj * bucket + bucket / 2 - half,
    y: sumY[best] / bestN,
    cells: bestN
  };
}

export function heightAt(world, x, z) {
  const half = WORLD / 2;
  const fi = clamp((x + half) / world.STEP, 0, world.RES - 1.001);
  const fj = clamp((z + half) / world.STEP, 0, world.RES - 1.001);
  const i = fi | 0, j = fj | 0;
  const tx = fi - i, tz = fj - j;
  const h = world.H;
  const a = h[world.idx(i, j)], b = h[world.idx(i + 1, j)];
  const c = h[world.idx(i, j + 1)], d = h[world.idx(i + 1, j + 1)];
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

export function biomeAt(world, x, z) {
  const half = WORLD / 2;
  const i = clamp(Math.round((x + half) / world.STEP), 0, world.RES - 1);
  const j = clamp(Math.round((z + half) / world.STEP), 0, world.RES - 1);
  return world.B[world.idx(i, j)];
}

export { pathField };
