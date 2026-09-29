import { RELIEF } from './relief.js';
import { WATER } from './water.js';
import { BIOMES } from './biome.js';
import { LINKS } from './link.js';
import { KIND, LIQUID, skirt, smoothstep, clamp,
         stampElement, elementMesh, disposeElement, baseDisc, pedestalMesh } from './contract.js';

/* =============================================================
   РЕЕСТР НАБОРА
   Единственная точка, где перечислен весь набор. Компоновщик карты
   работает только с этим списком и ничего не знает о конкретных
   деталях: ни про шум, ни про дорогу, ни про материалы.
   ============================================================= */

/* Наружу отдаём и сами шаблоны, и утилиты контракта: галерея и
   будущий компоновщик берут всё из одного входа. */
export { KIND, LIQUID, skirt, smoothstep, clamp,
         stampElement, elementMesh, disposeElement, baseDisc, pedestalMesh };
export { defineElement } from './contract.js';
export { BIOME, BIOME_INFO } from '../world.js';

export const ELEMENTS = [...RELIEF, ...WATER, ...BIOMES, ...LINKS];

export const BY_ID = new Map(ELEMENTS.map(e => [e.id, e]));

export const GROUPS = [
  { key: KIND.RELIEF, title: 'Рельеф' },
  { key: KIND.WATER, title: 'Гидро' },
  { key: KIND.BIOME, title: 'Биомы' },
  { key: KIND.LINK, title: 'Перемычки' }
];

export function elementsOf(kind) {
  return ELEMENTS.filter(e => e.kind === kind);
}

/* Профили элементов:
     'peak'   — вершина в центре, к краю сходит в ноль (холм, гряда, плато)
     'bowl'   — чаша: минимум в центре (котловина)
     'flat'   — почти не гнёт рельеф: пятно биома, микро-неровность
     'liquid' — выравнивает дно к своему уровню (озеро, яд, расплав, ручей)
     'step'   — ступень или разрыв, профиль немонотонный (уступ, мост, порог)
   Проверка «центр выше края» имеет смысл только для 'peak'. */
export const PROFILES = ['peak', 'bowl', 'flat', 'liquid', 'step'];

const FLAT_TOL = 3.5;   /* пятно не должно переписывать рельеф */

/* Точка на краю ядра. У вытянутых элементов (гряда, ручей, насыпь)
   расстояние считается по их собственной shape(), и она однородна
   первой степени: shape(k*u) = k*shape(u). Поэтому масштаб ищем
   делением, иначе проба вдоль короткой оси попадает в середину. */
function rimPoint(e) {
  let best = [e.core, 0], bestErr = Infinity;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const ux = Math.cos(a), uz = Math.sin(a);
    const perUnit = e.shape(ux, uz);
    if (perUnit < 1e-6) continue;
    const s = e.core / perUnit;
    const dx = ux * s, dz = uz * s;
    const err = Math.abs(e.shape(dx, dz) - e.core);
    if (err < bestErr) { bestErr = err; best = [dx, dz]; }
  }
  return best;
}

/* Проверка контракта. Один runnable-check без фреймворков:
   если элемент не проходит — набор сломан, и это видно сразу. */
export function validateKit() {
  const problems = [];
  const seen = new Set();
  for (const e of ELEMENTS) {
    if (!e.id) problems.push('элемент без id');
    if (!e.name) problems.push(`${e.id}: нет имени`);
    if (seen.has(e.id)) problems.push(`${e.id}: дубликат id`);
    seen.add(e.id);
    for (const f of ['heightAt', 'biomeAt', 'liquid', 'canPlaceAt', 'build', 'props', 'instantiate']) {
      if (typeof e[f] !== 'function') problems.push(`${e.id}: нет метода ${f}()`);
    }
    if (!(e.radius > 0)) problems.push(`${e.id}: некорректный radius`);
    if (!(e.core > 0 && e.core <= e.radius)) problems.push(`${e.id}: core вне [0..radius]`);
    if (!PROFILES.includes(e.profile)) problems.push(`${e.id}: неизвестный профиль "${e.profile}"`);

    const p = { anchorY: 0, dropDepth: 3, rise: 5, dir: 0, density: 4, deckHeight: 4, span: 9, ...e.defaults };

    /* Юбка обязана гаснуть. Точку берём по диагонали заведомо дальше
       радиуса: у вытянутых элементов (гряда, ручей) расстояние по
       собственной shape() считается иначе, чем по X. */
    const far = e.radius * 1.6;
    const outside = e.heightAt(far, far, 0, 0, 0, p);
    if (Math.abs(outside) > 1e-6) problems.push(`${e.id}: не гаснет за радиусом (${outside.toFixed(2)})`);

    const centre = e.heightAt(0, 0, 0, 0, 0, p);
    const edge = e.heightAt(e.core, 0, 0, 0, 0, p);
    if (Math.abs(centre) > 40) problems.push(`${e.id}: подозрительно большая дельта (${centre.toFixed(1)})`);

    if (e.profile === 'peak') {
      /* вершина в центре: спад к краю ядра, небольшой допуск на шум */
      if (Math.abs(edge) > Math.abs(centre) + 0.5) {
        problems.push(`${e.id}: край ядра выше центра — профиль вывернут`);
      }
      if (centre < 0) problems.push(`${e.id}: профиль peak, но центр ниже нуля`);
    } else if (e.profile === 'bowl') {
      if (centre >= 0) problems.push(`${e.id}: профиль bowl, но центр не ниже нуля`);
      if (Math.abs(edge) > Math.abs(centre) + 0.5) {
        problems.push(`${e.id}: чаша вывернута — край глубже центра`);
      }
    } else if (e.profile === 'flat') {
      let maxAbs = 0;
      for (let k = 0; k <= 8; k++) {
        const d = (e.core * k) / 8;
        maxAbs = Math.max(maxAbs, Math.abs(e.heightAt(d, d * 0.6, 0, 0, 0, p)));
      }
      if (maxAbs > FLAT_TOL) problems.push(`${e.id}: пятно сильно гнёт рельеф (${maxAbs.toFixed(1)})`);
    } else if (e.profile === 'liquid') {
      /* Инварианты озера. Плоское ДНО не требуется: земля, уже лежащая
         ниже уровня, остаётся на месте — озеро её не поднимает.
         Поверхность плоская по построению: один level на всё озеро.
         Проверяем то, что реально важно для набора:
           1) элемент ВРЕЗАЕТСЯ до отметки, а не добавляет дельту;
           2) не строит дамбу на своём краю (иначе шов с соседями);
           3) не поднимает землю, уже лежащую ниже уровня. */
      const anchor = 25;
      const liq = e.liquid({ p: { ...p, anchorY: anchor }, at: { x: 0, z: 0 } });
      if (!liq) {
        problems.push(`${e.id}: профиль liquid, но liquid() пуст`);
        continue;
      }
      if (!liq.kind) problems.push(`${e.id}: liquid() без kind`);
      if (!Number.isFinite(liq.level)) problems.push(`${e.id}: liquid() без уровня`);
      if (liq.level > anchor) problems.push(`${e.id}: уровень выше отметки установки`);

      const arg = { ...p, anchorY: anchor };

      /* (1) врезается на глубину своей котловины при любом рельефе
             выше уровня, и дно получается горизонтальным */
      const drop = arg.dropDepth ?? 3.6;
      for (const base of [liq.level + 0.5, liq.level + 4, liq.level + 15]) {
        const abs = base + e.heightAt(0, 0, base, 0, 0, arg);
        if (Math.abs(abs - (liq.level - drop)) > 0.6) {
          problems.push(`${e.id}: не выравнивает дно (${abs.toFixed(1)} вместо ${(liq.level - drop).toFixed(1)})`);
          break;
        }
      }
      /* дно горизонтально: разные отметки рельефа дают одну и ту же глубину */
      for (const base of [liq.level + 2, liq.level + 9, liq.level + 20]) {
        const abs = base + e.heightAt(0, 0, base, 0, 0, arg);
        if (Math.abs(abs - (liq.level - drop)) > 0.6) {
          problems.push(`${e.id}: дно зависит от исходного рельефа`);
          break;
        }
      }
      /* (2) на своём краю элемент не оставляет ни дамбы, ни ямы */
      const [rx, rz] = rimPoint(e);
      for (const base of [liq.level - 2, liq.level + 6]) {
        const atRim = base + e.heightAt(rx, rz, base, 0, 0, arg);
        if (Math.abs(atRim - base) > 0.9) {
          problems.push(`${e.id}: меняет рельеф у края (${(atRim - base).toFixed(2)}) — будет шов`);
          break;
        }
      }
      /* (3) не поднимает то, что уже ниже уровня */
      const deep = liq.level - 5;
      const lifted = deep + e.heightAt(0, 0, deep, 0, 0, arg);
      if (lifted > deep + 0.05) {
        problems.push(`${e.id}: поднимает дно ниже уровня (на ${(lifted - deep).toFixed(2)})`);
      }
    }
  }
  return problems;
}
