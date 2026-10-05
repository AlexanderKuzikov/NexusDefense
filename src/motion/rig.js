import * as THREE from 'three';

/* Движение существ: способ A — скелет и три клипа, способ B — повороты и
   масштаб двух узлов. Обе реализации берую одну и ту же геометрию из выгрузки
   и живут на одной шкале времени: иначе сравнение силуэтов ничего не значит.

   Границы фаз стоят на целых секундах не случайно. Шаг длится ровно секунду,
   клип ходьбы зациклен, поэтому в 2.0 / 3.0 / 5.0 фаза шага равна нулю и поза
   на стыке фаз совпадает. Стык можно резать без склейки, а склейка на общих
   костях всё равно потребовала бы нормировки весов — иначе three складывает их
   в сумме больше единицы.

   У всех трёх клипов ровно семь дорожек с одинаковыми именами. У поворота и
   гибели нет ног в сцене, но имена те же: иначе при смене клипа свойства, в
   которых новый клип не участвует, остались бы от предыдущей позы.

   ИНВАРИАНТ ПРИВЯЗКИ (проверяется замером в motion.html, не на глаз).
   `Skeleton.calculateInverses()` читает `bone.matrixWorld`, а шейдер считает
   `meshWorld · bindInverse · Σ(bone.matrixWorld · boneInverse) · bind · p`.
   Отсюда: матрица привязки должна совпадать с текущей `matrixWorld` меша, то
   есть `SkinnedMesh` обязан жить в корне сцены с единичной привязкой, а
   перемещение несут КОСТИ. Если сделать `SkinnedMesh` ребёнком движущейся
   группы, `meshWorld` уедет от bind-матрицы, и существо сместится вдвое. */

export const CYCLE = { len: 7.4, turn: 2.0, turnEnd: 3.0, fall: 5.0, fallEnd: 6.2 };
export const CLIP_LEN = { walk: 1.0, turn: 1.0, fall: 1.2 };
export const CLIP_NAMES = ['walk', 'turn', 'fall'];
export const BONE_NAMES = ['pelvis', 'torso', 'head', 'legL', 'legR'];
export const MAX_INFLUENCE = 4;
export const SKIN_BYTES_PER_VERTEX = 24;   // skinIndex 4×uint16 + skinWeight 4×float32

/* Габариты из контракта выгрузки (MODEL_SPECS в export-echoes-enemies).
   Манифест их не несёт, поэтому таблица продублирована здесь, а геометрия её
   проверяет: сверка при загрузке падает, если числа разошлись с файлом. */
export const SPECS = {
  husk: { width: 0.78, height: 0.47, hoverY: 0 },
  runner: { width: 0.27, height: 0.80, hoverY: 0 },
  wisp: { width: 0.86, height: 0.92, hoverY: 0.16 },
  swarmling: { width: 0.15, height: 0.41, hoverY: 0 },
  carapace: { width: 0.89, height: 0.70, hoverY: 0 },
  mote: { width: 0.50, height: 0.44, hoverY: 0.18 },
  maw: { width: 0.98, height: 0.86, hoverY: 0 },
};

const TAU = Math.PI * 2;
const KEY = 0.05;
const SPEED = 0.5;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 2.2);

/* Числа поворота и гибели общие для обоих способов: способ A пишет их в
   кости, способ B — в узлы. Разные числа означали бы сравнение двух разных
   анимаций вместо сравнения двух способов. */
const TURN = { lean: 0.24, dip: 0.02, torsoY: 0.55, torsoZ: 0.10, headX: 0.10, headY: 0.35 };
const FALL = { tip: 1.45, roll: 0.22, drop: 0.16, torsoX: 0.45, headX: 0.50, leg: 0.35, squashY: 0.28, squashXZ: 0.12 };

export function phaseAt(t) {
  const k = ((t % CYCLE.len) + CYCLE.len) % CYCLE.len;
  if (k < CYCLE.turn) return { name: 'walk', local: k, step: k, u: k / CYCLE.turn };
  if (k < CYCLE.turnEnd) {
    return { name: 'turn', local: k - CYCLE.turn, step: k, u: (k - CYCLE.turn) / (CYCLE.turnEnd - CYCLE.turn) };
  }
  if (k < CYCLE.fall) {
    return { name: 'walk', local: k, step: k, u: (k - CYCLE.turnEnd) / (CYCLE.fall - CYCLE.turnEnd) };
  }
  if (k < CYCLE.fallEnd) {
    return { name: 'fall', local: k - CYCLE.fall, step: CYCLE.fall, u: (k - CYCLE.fall) / CLIP_LEN.fall };
  }
  return { name: 'dead', local: CLIP_LEN.fall, step: CYCLE.fall, u: 1 };
}

/* Траектория одинакова для обоих способов: прямо на камеру, поворот на 90°,
   снова прямо. Разворот — свойство траектории, а не клипа: наклон в поворот
   есть у обоих способов, а разворот целиком на группе, иначе сравнивались бы
   разные пути.

   Идут все на камеру, а не вбок: на одной глубине семь существ видны сразу и
   сравнимы попиксельно. Разброс по глубине превращает ряд из семи в лестницу
   размеров, и далёкий `swarmling` в два пикселя нечего сравнивать. */
export function pathAt(t) {
  const k = ((t % CYCLE.len) + CYCLE.len) % CYCLE.len;
  const leg = SPEED * CYCLE.turn;
  const second = SPEED * (CYCLE.fall - CYCLE.turnEnd);
  if (k < CYCLE.turn) return { x: 0, z: SPEED * k, yaw: 0 };
  if (k < CYCLE.turnEnd) {
    const u = (k - CYCLE.turn) / (CYCLE.turnEnd - CYCLE.turn);
    return { x: 0, z: leg, yaw: -(Math.PI / 2) * easeOut(u) };
  }
  if (k < CYCLE.fall) return { x: -SPEED * (k - CYCLE.turnEnd), z: leg, yaw: -Math.PI / 2 };
  return { x: -second, z: leg, yaw: -Math.PI / 2 };
}

/* Походка: синус фазы шага, общий для обоих способов. Амплитуды уже в мировых
   единицах, потому что и кости, и узлы читают одни и те же числа. */
export function walkPose(step, spec) {
  const s = Math.sin(TAU * step);
  const c = Math.cos(TAU * step);
  const squash = Math.max(0, s);
  return {
    bobY: (0.5 - 0.5 * Math.cos(TAU * 2 * step)) * spec.height * 0.05,
    rollZ: 0.10 * s,
    pitchX: 0.05 * c,
    swayZ: 0.03 * s,
    legL: 0.55 * s,
    legR: -0.55 * s,
    headX: -0.06 * s,
    headZ: 0.05 * c,
    squashXZ: squash * 0.12,
    squashY: -squash * 0.12,
  };
}

/* Сверка габаритов с контрактом выгрузки. Таблица SPECS продублирована в
   этом файле, поэтому она обязана проверяться геометрией: расчёт весов и точка
   падения считаются от этих чисел, и разъезд с файлом тихо испортил бы замер.

   Высота берётся как есть, без вычитания hoverY: сборщик сажает минимум по Y
   ровно на hoverY, поэтому bbox-высота уже равна высоте из контракта. */
export function verifySpec(spec, box) {
  const size = box.getSize(new THREE.Vector3());
  const width = size.x;
  const height = size.y;
  return {
    width,
    height,
    ok: Math.abs(width - spec.width) < 0.01 && Math.abs(height - spec.height) < 0.01,
  };
}

// ---------- общие заготовки клипов ----------

const trackTimes = (duration) => {
  const times = [];
  for (let k = 0; k * KEY <= duration + 1e-9; k += 1) times.push(k * KEY);
  if (times[times.length - 1] < duration - 1e-9) times.push(duration);
  return times;
};

const qTrack = (bone, times, fn) => {
  const values = new Float32Array(times.length * 4);
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  times.forEach((time, i) => {
    const [x, y, z] = fn(time);
    q.setFromEuler(euler.set(x, y, z, 'XYZ'));
    values[i * 4] = q.x;
    values[i * 4 + 1] = q.y;
    values[i * 4 + 2] = q.z;
    values[i * 4 + 3] = q.w;
  });
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
};

const vTrack = (bone, kind, times, fn) => {
  const values = new Float32Array(times.length * 3);
  times.forEach((time, i) => {
    const [x, y, z] = fn(time);
    values[i * 3] = x;
    values[i * 3 + 1] = y;
    values[i * 3 + 2] = z;
  });
  return new THREE.VectorKeyframeTrack(`${bone}.${kind}`, times, values);
};

const walkClip = (spec) => {
  const times = trackTimes(CLIP_LEN.walk);
  const pose = (time) => walkPose(time, spec);
  return new THREE.AnimationClip('walk', CLIP_LEN.walk, [
    vTrack('pelvis', 'position', times, (time) => [0, spec.hoverY + pose(time).bobY, 0]),
    qTrack('pelvis', times, (time) => [0, 0, pose(time).swayZ]),
    vTrack('pelvis', 'scale', times, (time) => {
      const p = pose(time);
      return [1 + p.squashXZ, 1 + p.squashY, 1 + p.squashXZ];
    }),
    qTrack('torso', times, (time) => [pose(time).pitchX, 0, pose(time).rollZ]),
    qTrack('head', times, (time) => [pose(time).headX, 0, pose(time).headZ]),
    qTrack('legL', times, (time) => [pose(time).legL, 0, 0]),
    qTrack('legR', times, (time) => [pose(time).legR, 0, 0]),
  ]);
};

const turnClip = (spec) => {
  const times = trackTimes(CLIP_LEN.turn);
  const bell = (time) => Math.sin(Math.PI * clamp(time / CLIP_LEN.turn, 0, 1));
  return new THREE.AnimationClip('turn', CLIP_LEN.turn, [
    vTrack('pelvis', 'position', times, (time) => [0, spec.hoverY - TURN.dip * spec.height * bell(time), 0]),
    qTrack('pelvis', times, (time) => [0, 0, -TURN.lean * bell(time)]),
    vTrack('pelvis', 'scale', times, () => [1, 1, 1]),
    qTrack('torso', times, (time) => [0, -TURN.torsoY * bell(time), TURN.torsoZ * bell(time)]),
    qTrack('head', times, (time) => [-TURN.headX * bell(time), TURN.headY * bell(time), 0]),
    qTrack('legL', times, (time) => [0.55 * Math.sin(TAU * time), 0, 0]),
    qTrack('legR', times, (time) => [-0.55 * Math.sin(TAU * time), 0, 0]),
  ]);
};

const fallClip = (spec) => {
  const times = trackTimes(CLIP_LEN.fall);
  const e = (time) => easeOut(clamp(time / CLIP_LEN.fall, 0, 1));
  return new THREE.AnimationClip('fall', CLIP_LEN.fall, [
    vTrack('pelvis', 'position', times, (time) => [0, spec.hoverY - FALL.drop * spec.height * e(time), 0]),
    qTrack('pelvis', times, (time) => [FALL.tip * e(time), 0, FALL.roll * e(time)]),
    vTrack('pelvis', 'scale', times, (time) => {
      const k = e(time);
      return [1 + FALL.squashXZ * k, 1 - FALL.squashY * k, 1 + FALL.squashXZ * k];
    }),
    qTrack('torso', times, (time) => [FALL.torsoX * e(time), 0, 0]),
    qTrack('head', times, (time) => [FALL.headX * e(time), 0, 0]),
    qTrack('legL', times, (time) => [-FALL.leg * e(time), 0, 0]),
    qTrack('legR', times, (time) => [FALL.leg * e(time), 0, 0]),
  ]);
};

const clipsOf = (spec) => [walkClip(spec), turnClip(spec), fallClip(spec)];

// ---------- способ A: кости, веса, клипы ----------

/* Позы покоя. Таз стоит ровно на опорной пятке — в центре основания, — чтобы
   падение крутилось вокруг той же точки, что и в способе B, который крутит
   узлы вокруг начала координат. Иначе разница силуэтов на падении измеряла бы
   не способ, а выбор точки вращения. */
const boneRest = (spec) => ({
  pelvis: [0, spec.hoverY, 0],
  torso: [0, spec.hoverY + spec.height * 0.45, 0],
  head: [0, spec.hoverY + spec.height * 0.88, 0],
  legL: [-spec.width * 0.30, spec.hoverY + spec.height * 0.22, 0],
  legR: [spec.width * 0.30, spec.hoverY + spec.height * 0.22, 0],
});

/* Веса по высоте и по стороне: низ уходит в ноги, верх — в голову, середина
   делится между тазом и корпусом. Костяной тепловой развёртки здесь нет и это
   осознанно: пять костей общего силуэта — ровно тот минимум, который здесь и
   обсуждается, а развёртка по граням была бы второй отдельной работой. */
const weightFor = (x, y, spec) => {
  const t = clamp((y - spec.hoverY) / spec.height, 0, 1);
  const side = clamp(x / (spec.width * 0.5), -1, 1);
  const legMask = 1 - smooth(0.06, 0.42, t);
  const legL = legMask * 0.8 * (1 - smooth(-0.1, 0.55, side));
  const legR = legMask * 0.8 * smooth(-0.55, 0.1, side);
  const upper = 1 - legL - legR;
  const head = smooth(0.74, 0.96, t) * upper;
  const torso = smooth(0.24, 0.6, t) * (upper - head);
  return [upper - head - torso, torso, head, legL, legR];
};

const skinGeometry = (geometry, spec) => {
  const source = geometry.clone();
  const count = source.attributes.position.count;
  const index = new Uint16Array(count * MAX_INFLUENCE);
  const weight = new Float32Array(count * MAX_INFLUENCE);
  const pos = source.attributes.position;
  let influences = 0;
  for (let i = 0; i < count; i += 1) {
    const ranked = weightFor(pos.getX(i), pos.getY(i), spec)
      .map((value, bone) => ({ bone, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_INFLUENCE);
    const sum = ranked.reduce((acc, entry) => acc + entry.value, 0) || 1;
    ranked.forEach((entry, k) => {
      index[i * MAX_INFLUENCE + k] = entry.bone;
      weight[i * MAX_INFLUENCE + k] = entry.value / sum;
      if (entry.value > 1e-4) influences += 1;
    });
  }
  source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, MAX_INFLUENCE));
  source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, MAX_INFLUENCE));
  return {
    geometry: source,
    vertices: count,
    influences,
    bytes: count * SKIN_BYTES_PER_VERTEX,
  };
};

/* Кэш на вид: геометрия со весами, кости в позе покоя, обратные матрицы и
   клипы одинаковы для всех экземпляров существа — веса зависят только от
   геометрии, а не от экземпляра. На стене это разница между 150 анимациями и
   одной анимацией на вид. */
const sharedCache = new Map();

export function sharedFor(id, geometries, spec) {
  if (sharedCache.has(id)) return sharedCache.get(id);
  const skins = geometries.map((geometry) => skinGeometry(geometry, spec));
  const rest = boneRest(spec);
  const bones = BONE_NAMES.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.fromArray(rest[name]);
    return bone;
  });
  const root = new THREE.Group();
  root.name = `bones-${id}`;
  root.add(bones[0], bones[3], bones[4]);
  bones[0].add(bones[1]);
  bones[1].add(bones[2]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const clips = clipsOf(spec);
  const entry = {
    id,
    spec,
    skin: skins,
    rest,
    // Обратные матрицы — единственное, что можно делить между экземплярами.
    // Сам Skeleton делить нельзя: `update()` пишет boneMatrices на месте, и два
    // меша на одном скелете в один кадр перетирают друг друга.
    inverses: skeleton.boneInverses,
    clips,
    vertices: skins.reduce((sum, s) => sum + s.vertices, 0),
    influences: skins.reduce((sum, s) => sum + s.influences, 0),
    bytes: skins.reduce((sum, s) => sum + s.bytes, 0),
    keys: clips.reduce((sum, clip) => sum + clip.tracks.reduce((n, t) => n + t.times.length, 0), 0),
  };
  sharedCache.set(id, entry);
  return entry;
}

const buildBones = (shared) => {
  const bones = BONE_NAMES.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.fromArray(shared.rest[name]);
    return bone;
  });
  const root = new THREE.Group();
  root.name = `bones-${shared.id}`;
  root.add(bones[0], bones[3], bones[4]);
  bones[0].add(bones[1]);
  bones[1].add(bones[2]);
  return { root, bones };
};

/* Способ A. `group` несёт траекторию и кости, а меши остаются в корне сцены —
   см. инвариант привязки в шапке файла.

   Два меша (body, core) едут на ОДНОМ Skeleton: два скелета на одну анимацию
   невозможны, `update()` пишет boneMatrices на месте. Но и группу, в которой
   живут меши, двигать нельзя — поэтому `group` содержит только кости, а меши
   возвращаются отдельно, чтобы вызывающий добавил их в сцену сам. */
export function bindRig(id, geometries, materials, spec) {
  const shared = sharedFor(id, geometries, spec);
  const { root, bones } = buildBones(shared);
  const skeleton = new THREE.Skeleton(bones, shared.inverses);
  const group = new THREE.Group();
  group.name = `rig-${id}`;
  group.add(root);
  const meshes = geometries.map((_, i) => {
    const mesh = new THREE.SkinnedMesh(shared.skin[i].geometry, materials[i]);
    mesh.name = `${id}-${i}`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.bind(skeleton, new THREE.Matrix4());
    return mesh;
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of shared.clips) {
    const action = mixer.clipAction(clip);
    // Ходьба зациклена и держит время шага, остальные два клипа одноразовые.
    // Общее время миксера не используется: `mixer.setTime()` не продвигает
    // `LoopOnce` с `clampWhenFinished` — клип остаётся на нулевом кадре, и падение
    // молча не происходит. Поэтому у каждого действия своё `.time`.
    action.setLoop(clip.name === 'walk' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = clip.name !== 'walk';
    action.play();
    actions[clip.name] = action;
  }
  return {
    method: 'A',
    id,
    group,
    bones,
    skeleton,
    meshes,
    mixer,
    actions,
    bonesCount: BONE_NAMES.length,
    clipsCount: shared.clips.length,
    vertices: shared.vertices,
    influences: shared.influences,
    bytes: shared.bytes,
    keys: shared.keys,
    spec,
  };
}

/* Ставит позу по времени цикла. Поза — функция времени, а не шага
   интегрирования, поэтому один и тот же кадр снимается при любом fps.

   Активное действие всегда одно, но остальные НЕ выключаются: у них обнуляется
   вес и время. Выключение здесь ломает две вещи сразу — `enabled = false`
   оставляет свойства предыдущего кадра (паление не сбрасывается), а попытка
   продвигать клип через `mixer.setTime` не двигает одноразовый клип с
   `clampWhenFinished` вовсе: он остаётся на нулевом кадре, то есть на позе
   привязки, и падение молча не происходит. Поэтому у каждого действия своё
   `.time`, а смешивание весов нормализует three сам. */
export function poseSkeleton(rig, phase) {
  const active = phase.name === 'dead' ? 'fall' : phase.name;
  for (const name of CLIP_NAMES) {
    const action = rig.actions[name];
    if (name === active) {
      action.weight = 1;
      action.time = name === 'walk'
        ? phase.local % CLIP_LEN.walk
        : Math.min(phase.local, CLIP_LEN[name]);
    } else {
      action.weight = 0;
      action.time = 0;
    }
  }
  rig.mixer.update(0);
}

// ---------- способ B: два узла ----------

export function nodeRig(id, nodes, spec) {
  const group = new THREE.Group();
  group.name = `rig-${id}`;
  for (const node of nodes) {
    node.position.set(0, 0, 0);
    node.rotation.set(0, 0, 0);
    node.scale.set(1, 1, 1);
    group.add(node);
  }
  return { method: 'B', id, group, nodes, body: nodes[0], core: nodes[1], nodesCount: nodes.length, spec };
}

const poseNode = (node, position, rotation, scale) => {
  node.position.set(0, position, 0);
  node.rotation.set(rotation[0], rotation[1], rotation[2]);
  node.scale.set(scale[0], scale[1], scale[2]);
};

export function poseNodes(rig, phase) {
  const { spec, nodes } = rig;
  const [body, core] = nodes;
  if (phase.name === 'turn') {
    const bell = Math.sin(Math.PI * clamp(phase.local / CLIP_LEN.turn, 0, 1));
    const dip = -TURN.dip * spec.height * bell;
    poseNode(body, dip, [0, -TURN.torsoY * bell, TURN.lean * bell], [1, 1, 1]);
    poseNode(core, dip * 1.4, [0, -TURN.headY * bell, -TURN.lean * bell * 1.6], [1, 1, 1]);
    return;
  }
  if (phase.name === 'fall' || phase.name === 'dead') {
    const k = easeOut(phase.u);
    const drop = -FALL.drop * spec.height * k;
    const squashXZ = 1 + FALL.squashXZ * k;
    const squashY = 1 - FALL.squashY * k;
    poseNode(body, drop, [FALL.tip * k, 0, FALL.roll * k], [squashXZ, squashY, squashXZ]);
    // Ядро отстаёт от корпуса: на двух узлах это единственный доступный
    // вторичный признак, и без него падение читается как упавшая доска.
    const lag = k * 0.82;
    poseNode(core, drop * 1.25, [FALL.tip * lag, 0, -FALL.roll * k * 1.3], [squashXZ * 1.02, 1 - FALL.squashY * k * 0.7, squashXZ * 1.02]);
    return;
  }
  const p = walkPose(phase.step, spec);
  const lag = walkPose(phase.step - 0.08, spec);
  poseNode(body, p.bobY, [p.pitchX, 0, p.rollZ + p.swayZ], [1 + p.squashXZ, 1 + p.squashY, 1 + p.squashXZ]);
  poseNode(core, lag.bobY * 1.1, [lag.pitchX * 0.7, 0, -(lag.rollZ + lag.swayZ) * 1.3], [1, 1, 1]);
}

export function disposeRig(rig) {
  if (rig.mixer) {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.group);
  }
  rig.group.removeFromParent();
  // Геометрия и обратные матрицы общие на вид, освобождать их нельзя.
  for (const mesh of rig.meshes ?? []) mesh.removeFromParent();
}

export { TURN, FALL };