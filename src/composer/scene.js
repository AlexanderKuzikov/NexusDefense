/* =============================================================
   СЦЕНА СОБРАННОЙ КАРТЫ
   =============================================================
   Компоновщик отдал две таблицы и сеть — здесь они становятся видимыми.
   Рельеф, полотно дороги и база рисуются ОДНИМ мешем с вершинными
   цветами: отдельные меши на дороге и земле означали бы два слоя в одной
   точке на повороте, то есть тот самый нахлёст, ради которого стык
   пришлось переделывать. Цвет дороги смешивается с цветом земли по
   профилю полотна, а высота приподнята тем же профилем, поэтому край
   ��олучается откосом, а не ступенькой в клетку сетки.
   ============================================================= */

import * as THREE from 'three';
import { BIOME } from '../terrain/world.js';
import { elementMesh } from '../terrain/elements/index.js';

/* Граница полотна для ЦВЕТА. Клетка в объединении прямоугольников красится
   в дорогу целиком, а сглаживание идёт ровно на одну клетку наружу.

   Смешивать по полуширине нельзя: множество «ближе 2.4» в вогнутом углу
   поворота скругляет его дугой радиуса в половину полуширины, то есть на
   2.4 единицы — половиной ширины полотна. Прямых углов на карте
   владельца тогда не оставалось вовсе, и это выглядело как «дорога стала
   мягкой», а не как стык. */
function edgeProfile(d, step) {
  if (d === 0) return 1;
  if (d >= step) return 0;
  return 1 - d / step;
}

/* Палитра подобрана под образец `Map-and-Router.png` и откалибрована
   замером на кадре. Значения — albedo, а не то, что на экране: диффуз
   в MeshStandardMaterial делится на π, и ACES тянет яркость вниз, так
   что 0x6c6c6e выходит на экран как 179, а 0x83ff40 — как (204, 247,
   102) против (204, 255, 102) на файле. Зелёный канал файла не
   достигается: при потолке ACES это 255 из 255, и подбирать его можно
   только бесконечным светом. Различение «серая дорога / зелёная земля»
   держится с запасом вчетверо. */
export const PALETTE = {
  [BIOME.GRASS]: 0x7aff30,
  [BIOME.FOREST]: 0x2f6b28,
  [BIOME.ROCK]: 0x8a8f96,
  [BIOME.SAND]: 0xb59a5e,
  [BIOME.SNOW]: 0xe8eef4,
  [BIOME.WATER]: 0x3a7ab0,
  [BIOME.TOXIC]: 0x9ac93f,
  [BIOME.LAVA]: 0xc95a1c,
  [BIOME.ASH]: 0x6b5f52,
  [BIOME.ROAD]: 0x68686a,
  [BIOME.CRYSTAL]: 0x8f6ad8
};
export const BASE_COLOR = 0x3d3e40;

const _c = new THREE.Color();
const rgb = hex => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };
const CACHE = new Map();
function lin(biome) {
  if (!CACHE.has(biome)) CACHE.set(biome, rgb(PALETTE[biome] ?? PALETTE[BIOME.GRASS]));
  return CACHE.get(biome);
}

/* Детерминированная мелкая вариация: без неё большая плоскость после
   ACES читается заливкой, и границы дороги теряются. */
function grain(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function buildMapScene(map, opts = {}) {
  const g = map.grid;
  const roadBiome = PALETTE[BIOME.ROAD];
  const roadLin = rgb(roadBiome);

  const geo = new THREE.PlaneGeometry(g.WORLD, g.WORLD, g.RES - 1, g.RES - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(g.RES * g.RES * 3);

  for (let j = 0; j < g.RES; j++) {
    for (let i = 0; i < g.RES; i++) {
      const n = g.idx(i, j);
      const x = i * g.STEP - g.half;
      const z = j * g.STEP - g.half;
      pos.setY(n, map.h[n]);

      const k = edgeProfile(map.road.dist[n], g.STEP);
      const c = lin(map.B[n]);
      const w = 0.94 + grain(x, z) * 0.12;
      colors[n * 3] = (c[0] + (roadLin[0] - c[0]) * k) * w;
      colors[n * 3 + 1] = (c[1] + (roadLin[1] - c[1]) * k) * w;
      colors[n * 3 + 2] = (c[2] + (roadLin[2] - c[2]) * k) * w;
    }
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  /* Витрина отражает вид по X, чтобы совпасть с образцом (сеть не
     зеркальна, и без отражения кадр сравнивать не с чем). Отражение
     меняет handedness проекции, поэтому нормали компенсируются вручную:
     иначе двусторонний рендер освещает изнанку, и вся плита уходит в
     тёмный зелёный. */
  if (opts.flipNormals) {
    const nrm = geo.attributes.normal;
    for (let k = 0; k < nrm.count; k++) {
      nrm.setXYZ(k, -nrm.getX(k), -nrm.getY(k), -nrm.getZ(k));
    }
    nrm.needsUpdate = true;
  }

  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    /* DoubleSide — из-за flip вида по X на камере витрины: отражение
       меняет handedness проекции, winding треугольников инвертируется,
       и обычный backface culling съедает весь рельеф. Обратная сторона
       рельефа всё равно не видна — камера строго сверху. */
    vertexColors: true, roughness: 0.95, metalness: 0.04, side: THREE.DoubleSide
  }));
  land.receiveShadow = true;

  const group = new THREE.Group();
  group.add(land);

  if (map.base) group.add(buildBase(map));
  for (const d of map.details) {
    const m = elementMesh(d.inst);
    const { i, j } = { i: Math.round((d.at.x + g.half) / g.STEP), j: Math.round((d.at.z + g.half) / g.STEP) };
    m.position.set(d.at.x, map.h[g.idx(i, j)], d.at.z);
    group.add(m);
  }
  if (opts.label !== false) group.add(buildPlateFrame(g));

  return { group, land, dispose: () => disposeTree(group) };
}

/* База — тёмный квадрат, и дорога упирается в её край, поэтому она
   стоит последним слоем и не делит с полотном ни одной клетки. */
function buildBase(map) {
  const g = map.grid;
  const b = map.base;
  const th = 0.55;
  const r = Math.ceil(b.half / g.STEP);
  const ci = Math.round((b.x + g.half) / g.STEP);
  const cj = Math.round((b.z + g.half) / g.STEP);
  let sum = 0, n = 0;
  for (let k = 0; k < 4; k++) {
    const i = ci + (k & 1 ? -r : r);
    const j = cj + (k & 2 ? -r : r);
    sum += map.h[g.idx(i, j)]; n++;
  }
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(b.half * 2, th, b.half * 2),
    new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.8, metalness: 0.2 })
  );
  m.position.set(b.x, sum / n + th / 2 - 0.05, b.z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* Рамка плиты: край читается как край, а не как обрыв пустоты. */
function buildPlateFrame(g) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(g.WORLD, 0.6, g.WORLD)),
    new THREE.LineBasicMaterial({ color: 0x2b6a8a })
  );
  line.position.y = -0.3;
  return line;
}

function disposeTree(root) {
  root.traverse(n => {
    n.geometry?.dispose();
    const mat = n.material;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
    else mat?.dispose();
  });
}