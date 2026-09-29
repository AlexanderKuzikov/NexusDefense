<p align="center">
  <a href="https://threejs.org"><img alt="Three.js" src="https://img.shields.io/badge/Three.js-0.160.1-3178C6?logo=three.js&logoColor=white"></a>
  <a href="https://developer.mozilla.org/ru/docs/Web/JavaScript"><img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=white"></a>
  <a href="https://www.python.org"><img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white"></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="License" src="https://img.shields.io/badge/license-Apache_2.0-blue.svg"></a>
</p>

<h1 align="center">Nexus Defense</h1>
<p align="center">Техно-футуристический Tower Defense на Three.js — прототипы и набор элементов ландшафта</p>

---

Прототипы tower defense без сборки, npm и внешних ассетов: вся геометрия
процедурная, Three.js грузится с unpkg. Репозиторий закрывает две задачи —
визуальные прототипы (башни, враги, ландшафт) и **набор из 22 деталей
ландшафта**, из которых отдельный компонент-компоновщик складывает карту.

- **Набор элементов** — 22 детали: рельеф, гидро, биомы, дорожные перемычки
- **Жёсткое ядро + мягкая юбка** — детали срастаются без швов и не конфликтуют
- **Песочница в галерее** — ставишь детали кликом и сразу видишь сшивку
- **Галерея башен** — 10 процедурных башен с орбитой и тестовой стрельбой
- **Вторая волна башен** — ещё 15 прототипов в `towers2.html`, отдельной страницей
- **Бестиарий** — 30 врагов из общих примитивов
- **Шейдерные жидкости** — вода, расплав и яд с маской владения территорией

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/NexusDefense.git
cd NexusDefense
python serve.py 8777
```

- `http://127.0.0.1:8777/elements.html` — набор ландшафта и песочница
- `http://127.0.0.1:8777/towers.html` — башни
- `http://127.0.0.1:8777/towers2.html` — вторая волна башен, 15 прототипов
- `http://127.0.0.1:8777/bestiary.html` — бестиарий
- `http://127.0.0.1:8777/terrain.html` — демо генератора карты

Проверка контракта набора, без браузера и без npm:

```bash
node --import ./tools/register-stub.mjs tools/check-kit.mjs
```

## Документация

- [`docs/API.md`](docs/API.md) — контракт набора, главный документ для компоновщика
- [`docs/kit-reference.md`](docs/kit-reference.md) — справочник по всем 22 деталям (генерируется из кода)
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние проекта, открытые проблемы, журнал
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — архитектурные решения
- [`AGENTS.md`](AGENTS.md) — инструкции агентам

## Структура

```
elements.html                 галерея набора + песочница
towers.html  towers2.html     прототипы башен: 10 базовых и 15 второй волны
bestiary.html                 прототипы врагов
terrain.html                  демо монолитного генератора мира
src/terrain/elements/         набор: контракт, 4 группы деталей, реестр
src/terrain/                  общий рендер: шум, шейдеры, пропсы, огонь
tools/                        проверка контракта, генератор справочника
docs/                         документация
serve.py                      локальный сервер с запретом кеша
```

## Статус

**v0.1** — набор элементов готов и проверен, компоновщик карты не написан.
Прототипы башен, бестиария и генератора карты работают без ошибок.

## Лицензия

Apache-2.0 © Alexander Kuzikov. Файл лицензии пока не добавлен.
