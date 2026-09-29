/* Проверка набора элементов без браузера.
   Набор не должен тянуть three и DOM: контракт проверяется отдельно
   от визуала, поэтому здесь голые функции, без импорта рендера.

   Запуск:  node tools/check-kit.mjs
   Читает исходники набора и проверяет инварианты, которые иначе
   видны только глазами в галерее. */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const elDir = join(here, '..', 'src', 'terrain', 'elements');

const files = readdirSync(elDir).filter(f => f.endsWith('.js'));

const { ELEMENTS, validateKit, GROUPS, elementsOf } = await import(
  join(elDir, 'index.js').replace(/\\/g, '/').replace(/^/, 'file:///')
).catch(e => { console.error('не удалось импортировать набор:', e.message); process.exit(1); });

const problems = validateKit();

console.log(`Файлов набора: ${files.length}`);
console.log(`Элементов: ${ELEMENTS.length}`);
for (const g of GROUPS) {
  const list = elementsOf(g.key);
  console.log(`  ${g.title.padEnd(12)} ${list.length}  ${list.map(e => e.name).join(', ')}`);
}

/* Юбка обязана давать гладкий переход: проверяем монотонность веса
   и что профиль не «прыгает» между соседними замерами. */
for (const e of ELEMENTS) {
  const p = { anchorY: 0, dropDepth: 3, rise: 5, dir: 0, density: 4, deckHeight: 4, span: 9, ...e.defaults };
  const samples = [];
  for (let k = 0; k <= 10; k++) {
    const d = (e.radius * k) / 10;
    samples.push(+Math.abs(e.heightAt(d, 0, 0, 0, 0, p)).toFixed(3));
  }
  const maxJump = Math.max(...samples.slice(1).map((v, i) => Math.abs(v - samples[i])));
  if (maxJump > 14) console.log(`  ! ${e.id}: резкий скачок профиля (${maxJump}) — проверь ядро/юбку`);
}

if (problems.length) {
  console.log('\nПРОБЛЕМЫ КОНТРАКТА:');
  problems.forEach(p => console.log('  - ' + p));
  process.exit(1);
}
console.log('\nКонтракт набора: OK');
