import * as THREE from 'three';

/* Замер силуэта в пикселях.

   Инструмент, а не украшение: оба способа снимаются ОДНОЙ И ТОЙ ЖЕ камерой,
   иначе разница кадров измеряла бы разницу ракурсов. Масштаб задан прямо в
   пикселях на единицу — так проверяется игровая дистанция, а не «примерно
   издалека».

   Кадр берётся с плоской белой заливкой по чёрному фону и без тонмаппинга:
   силуэт — это покрытие, а не цвет, и ACES на белом даёт 0.8, из-за чего
   порог в 0.5 срезал бы край. Отключение тонмаппинга на время съёмки
   обязано восстановиться, иначе следующий кадр витрины уедет по тону.

   Сглаживание в таргете выключено намеренно: у силуэта с MSAA край размазан
   по нескольким пикселям, и «различие в N пикселей» перестаёт быть числом.
   Порог 0.5 по бинарному кадру даёт воспроизводимый результат. */

const SOLID = new THREE.MeshBasicMaterial({ color: 0xffffff });

export class SilhouetteProbe {
  constructor(renderer, { width = 128, height = 128, fov = 42 } = {}) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.fov = fov;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    this.buffer = new Uint8Array(width * height * 4);
    this.mask = new Uint8Array(width * height);
    this.scene = new THREE.Scene();
    // В сцене инструмента нет источников света, и обычный материал вышел бы
    // чёрным — то есть слился бы с фоном. Белая заливка поверх всех материалов
    // делает кадр независимым от освещения, а значит сравнимым.
    this.scene.overrideMaterial = SOLID;
    this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 400);
    this.view = new THREE.Vector3(0.18, 0.22, 1).normalize();
  }

  /* Расстояние, при котором единица мира даёт ровно pxPerUnit пикселей. */
  distanceFor(pxPerUnit) {
    const half = Math.tan((this.fov * Math.PI) / 360);
    return this.height / (2 * pxPerUnit * half);
  }

  /* Ставит камеру на существо по центру его габаритов и заданному масштабу.
     Ракурс тот же, что на витрине: силуэт должен читаться оттуда же, откуда
     на него смотрят в игре. */
  aim(center, pxPerUnit) {
    this.camera.position.copy(center).addScaledVector(this.view, this.distanceFor(pxPerUnit));
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /* Съёмка. Принимает МАССИВУ объектов, потому что у способа A кости и меши
     намеренно лежат в разных ветках графа (см. инвариант привязки в rig.js):
     в кадр должны попасть и те, и другие. Прежние родители запоминаются и
     восстанавливаются — инструмент не имеет права разбирать витрину. */
  capture(objects, center, pxPerUnit) {
    const renderer = this.renderer;
    const toneMapping = renderer.toneMapping;
    const clearAlpha = renderer.getClearAlpha();
    const clear = new THREE.Color();
    renderer.getClearColor(clear);

    this.aim(center, pxPerUnit);
    const hosts = Array.isArray(objects) ? objects : [objects];
    const parents = hosts.map((object) => object.parent);
    hosts.forEach((object, i) => {
      if (parents[i]) parents[i].remove(object);
      this.scene.add(object);
    });
    this.scene.updateMatrixWorld(true);

    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    // Кадр прогревается и снимается отдельно. Первый рендер скелетного меша в
    // таргет возвращает пустую маску: программа и текстура костей на этом кадре
    // ещё не подняты. Молчаливый ноль здесь опаснее всего — по нему и сравнение
    // A=B, и разница силуэтов прошли бы как «совпало», не показав ничего.
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, this.width, this.height, this.buffer);

    renderer.setRenderTarget(null);
    renderer.toneMapping = toneMapping;
    renderer.setClearColor(clear, clearAlpha);
    hosts.forEach((object, i) => {
      this.scene.remove(object);
      if (parents[i]) parents[i].add(object);
    });

    return this.#mask();
  }

  /* Каждому снимку — свой буфер. Общий буфер означал бы, что второй снимок
     затирает первый и сравнение идёт массива с самим собой: разность всегда
     ноль, и замер молча врал бы ровно в том месте, где он нужен. */
  #mask() {
    const { buffer, width, height } = this;
    const mask = new Uint8Array(width * height);
    let count = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < height; y += 1) {
      // Буфер GL начинается снизу, а пиксельные координаты считаются сверху —
      // без разворота bounding box выходит зеркальным по вертикали.
      const row = height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const offset = (row * width + x) * 4;
        const on = buffer[offset] > 127 ? 1 : 0;
        mask[y * width + x] = on;
        if (!on) continue;
        count += 1;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return {
      width,
      height,
      mask,
      count,
      minX,
      minY,
      maxX,
      maxY,
      boxWidth: count ? maxX - minX + 1 : 0,
      boxHeight: count ? maxY - minY + 1 : 0,
      centroid: count ? { x: sumX / count, y: sumY / count } : null,
    };
  }

  /* Различие двух силуэтов. Ключевое число — `diff`: сколько пикселей занято в
     одном силуэте и не занято в другом.

     `align` сдвигает второй силуэт так, чтобы центры их габаритов совпали, и
     возвращает разность уже без сдвига. На игровом масштабе тонкий силуэт
     шириной в четыре пикселя теряет половину пересечения от сдвига на один
     пиксель, и сырой `diff` тогда измеряет не форму, а округление сетки.
     С выровненными габаритами остаётся ровно та разница формы, которая важна. */
  compare(a, b, { align = false } = {}) {
    const { width, height, mask: sourceA } = a;
    const rawB = b.mask;
    let offsetX = 0;
    let offsetY = 0;
    if (align && a.count && b.count) {
      // Сдвиг нужен туда, откуда центр B должен прийти в центр A: shifted[x]
      // берёт B по индексу x + offset, то есть центр B уезжает влево на offset.
      offsetX = Math.round((b.minX + b.maxX - a.minX - a.maxX) / 2);
      offsetY = Math.round((b.minY + b.maxY - a.minY - a.maxY) / 2);
    }
    const shifted = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sx = x + offsetX;
        const sy = y + offsetY;
        shifted[y * width + x] = sx >= 0 && sx < width && sy >= 0 && sy < height
          ? rawB[sy * width + sx]
          : 0;
      }
    }
    let both = 0;
    let onlyA = 0;
    let onlyB = 0;
    for (let i = 0; i < sourceA.length; i += 1) {
      const left = sourceA[i];
      const right = shifted[i];
      if (left && right) both += 1;
      else if (left) onlyA += 1;
      else if (right) onlyB += 1;
    }
    const union = both + onlyA + onlyB;
    let shift = null;
    if (a.centroid && b.centroid) {
      shift = Math.hypot(a.centroid.x - b.centroid.x, a.centroid.y - b.centroid.y);
    }
    return {
      both,
      onlyA,
      onlyB,
      diff: onlyA + onlyB,
      union,
      iou: union ? both / union : 1,
      fillA: a.count / (width * height),
      fillB: b.count / (width * height),
      centroidShift: shift,
      boxDelta: {
        x: b.minX - a.minX,
        y: b.minY - a.minY,
        width: b.boxWidth - a.boxWidth,
        height: b.boxHeight - a.boxHeight,
      },
    };
  }

  dispose() {
    this.target.dispose();
    SOLID.dispose();
  }
}

export { SOLID };

/* Пустой силуэт — почти всегда поломка инструмента, а не честный результат:
   существо, у которого в кадре ноль пикселей, не бывает. Молчаливый ноль
   превращал бы «привязка не считается» в «способы совпали до пикселя», поэтому
   пустой кадр поднимает исключение, а не возвращается числом. */
export function assertNotEmpty(shot, label) {
  if (shot.count === 0) {
    throw new Error(`probe: ${label} gave an empty silhouette — the capture is broken, not the model`);
  }
  return shot;
}

/* Разбор разницы на связные пятна. Это то, что решает вывод: одна крупная
   клякса — реальное изменение формы, которое глаз берёт, а россыпь мелких
   точек вдоль контура — дрожание края на полпикселя, которое глаз не берёт.
   Одно только число пикселей эту разницу не различает, поэтому оно и считалось
   вручную по картинке. */
export function diffBlobs(a, b) {
  const { width, height } = a;
  const diff = new Uint8Array(width * height);
  for (let i = 0; i < diff.length; i += 1) {
    diff[i] = a.mask[i] !== b.mask[i] ? 1 : 0;
  }
  const seen = new Uint8Array(width * height);
  let largest = 0;
  let count = 0;
  let total = 0;
  const stack = [];
  for (let start = 0; start < diff.length; start += 1) {
    if (!diff[start] || seen[start]) continue;
    count += 1;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop();
      size += 1;
      const x = at % width;
      const y = (at - x) / width;
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const next = ny * width + nx;
        if (diff[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      };
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    total += size;
    if (size > largest) largest = size;
  }
  return { total, blobs: count, largest, spread: largest / Math.max(1, total) };
}