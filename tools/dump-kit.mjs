/* Выгружает контракт набора в markdown-таблицы.
   Документация по объектам генерируется из кода, а не пишется руками:
   иначе она разойдётся с набором при первом же изменении детали.
   Запуск: node --import ./tools/register-stub.mjs tools/dump-kit.mjs
*/
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const elDir = join(here, '..', 'src', 'terrain', 'elements');
const { ELEMENTS, GROUPS, elementsOf } = await import(
  join(elDir, 'index.js').replace(/\\/g, '/').replace(/^/, 'file:///')
);

const out = [];
out.push('<!-- СГЕНЕРИРОВАНО: node --import ./tools/register-stub.mjs tools/dump-kit.mjs');
out.push('     Правь элементы в src/terrain/elements/, потом перегенерируй. -->');
out.push('');

for (const g of GROUPS) {
  const els = elementsOf(g.key);
  if (!els.length) continue;
  out.push(`## ${g.title} (${els.length})`);
  out.push('');
  out.push('| id | Название | Профиль | След R | Ядро | Цена | Метки |');
  out.push('|----|----------|----------|--------|------|------|-------|');
  for (const e of els) {
    out.push(`| \`${e.id}\` | ${e.name} | ${e.profile} | ${e.radius} | ${e.core} | ${e.cost} | ${e.tags.join(', ')} |`);
  }
  out.push('');
  for (const e of els) {
    const defs = e.defaults || {};
    const defStr = Object.entries(defs).map(([k, v]) => `${k}=${v}`).join(', ') || '—';
    out.push(`### ${e.name} — \`${e.id}\``);
    out.push('');
    out.push(e.note || '');
    out.push('');
    out.push(`- **Профиль:** \`${e.profile}\` · **след:** R ${e.radius}, ядро ${e.core} · **цена:** ${e.cost}`);
    out.push(`- **Метки:** ${e.tags.map(t => `\`${t}\``).join(', ')}`);
    out.push(`- **Параметры по умолчанию:** ${defStr}`);
    const liq = e.liquid({ p: { anchorY: 0, dropDepth: 3, rise: 5, deckHeight: 4, span: 9, ...defs }, at: { x: 0, z: 0 } });
    if (liq) out.push(`- **Жидкость:** \`${liq.kind}\`, уровень = anchorY − ${defs.dropDepth ?? '—'}`);
    /* правило постановки: сообщаем об отказе на заведомо плохом месте */
    const bad = [{}, { slope: 9 }, { h: 99 }, { distRoad: 0 }, { distRoad: 4, overLiquid: false }];
    for (const ctx of bad) {
      const c = { h: 0, slope: 0, distRoad: 4, near: [], overLiquid: true, ...ctx };
      const r = e.canPlaceAt(c);
      if (!r.ok) { out.push(`- **Правило:** нельзя, если ${r.why}`); break; }
    }
    out.push('');
  }
}

const target = join(here, '..', 'docs', 'kit-reference.md');
writeFileSync(target, out.join('\n'), 'utf8');
console.log(`элементов: ${ELEMENTS.length}; записано docs/kit-reference.md (${out.length} строк)`);
