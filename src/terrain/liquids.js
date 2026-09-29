import * as THREE from 'three';
import { WORLD, WATER_LEVEL, TOXIC_LEVEL, LAVA_LEVEL,
         OWN_WATER, OWN_TOXIC, OWN_LAVA } from './world.js';

/* Поверхности жидкостей.
   Владение территорией берётся из МЯГКОЙ маски (линейная фильтрация),
   а глубина — из высоты. Одно даёт плавный берег, второе — корректную
   толщину слоя. Смешивать их в одну проверку нельзя: либо ступеньки,
   либо жидкость заливает чужие котловины. */

const VERT = /* glsl */`
  varying vec3 vWorld;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/* мягкий вес владения: 1 внутри, 0 в чужих термиториях */
const OWN = /* glsl */`
  uniform sampler2D uHeight;
  uniform sampler2D uOwn;
  uniform float uLevel;
  uniform float uOwnId;
  uniform float uSoft;

  /* out: x — вес владения, y — глубина 0..1; отбрасывает при ~0 */
  vec2 sampleLiquid(){
    float own = texture2D(uOwn, vUv).r * 255.0;
    float w = 1.0 - clamp(abs(own - uOwnId), 0.0, 1.0);
    if(w <= 0.004) return vec2(0.0);
    float ground = texture2D(uHeight, vUv).r;
    float d = uLevel - ground;
    if(d <= 0.0) return vec2(0.0);
    return vec2(w, clamp(d / uSoft, 0.0, 1.0));
  }
`;

const NOISE = /* glsl */`
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
`;

const base = (own, seg) => ({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uHeight: { value: null },
    uOwn: { value: null },
    uLevel: { value: 0 },
    uOwnId: { value: own },
    uSoft: { value: seg }
  },
  vertexShader: VERT
});

/* Плоскость жидкости. Размер задаёт вызывающий: тот же шейдер
   используется и на карте 200×200, и на стенде набора, поэтому
   WORLD здесь только значение по умолчанию. */
function liquidPlane(size, seg) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

/* ---------- вода ---------- */
export function makeWater(heightTex, ownTex, level = WATER_LEVEL, size = WORLD, depth = 4.5) {
  const geo = liquidPlane(size, 160);

  const cfg = base(OWN_WATER, 3.0);
  const mat = new THREE.ShaderMaterial({
    ...cfg,
    uniforms: {
      ...cfg.uniforms,
      uHeight: { value: heightTex }, uOwn: { value: ownTex },
      uLevel: { value: level },
      /* Глубина нормируется на глубину самой котловины: при жёсткой
         шкале озеро мгновенно уходило в «глубокое» и темнело в
         почти чёрный, хотя вода должна оставаться синей. */
      uSoft: { value: Math.max(1.6, depth * 1.15) },
      /* Цвета берём с запасом: THREE.Color переводит их в линейный
         sRGB, а ACES потом затемняет. У синего канала запас уходит
         почти весь, и вода уходила в чёрный. */
      uShallow: { value: new THREE.Color(0xb4ecff) },
      uDeep: { value: new THREE.Color(0x3fa6d8) },
      uFoam: { value: new THREE.Color(0xf2fbff) }
    },
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld; varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uShallow, uDeep, uFoam;
      ${OWN}
      ${NOISE}

      /* Частоты подобраны под масштаб детали. Прежние (0.2…0.5)
         давали длину волны 12–30 единиц — на озере в 26 единиц это
         меньше одного цикла, и вода выглядела ровным кружком. */
      float wave(vec2 p, float t){
        float w = 0.0;
        w += sin(p.x * 1.55 + t * 1.5) * 0.42;
        w += sin(p.y * 1.90 - t * 1.2) * 0.34;
        w += sin((p.x + p.y) * 0.95 + t * 2.1) * 0.28;
        w += sin((p.x - p.y) * 2.70 - t * 2.8) * 0.16;
        w += sin((p.x * 0.4 + p.y * 0.3) * 3.1 + t * 1.1) * 0.12;
        return w;
      }

      void main(){
        vec2 s = sampleLiquid();
        if(s.y <= 0.0) discard;
        float own = s.x, depth = s.y;

        float t = uTime;
        float h = wave(vWorld.xz, t);
        float e = 0.35;
        float hx = wave(vWorld.xz + vec2(e, 0.0), t);
        float hz = wave(vWorld.xz + vec2(0.0, e), t);
        vec3 n = normalize(vec3((h - hx) * 3.2, 1.0, (h - hz) * 3.2));

        vec3 pos = vWorld; pos.y += h * 0.22;
        vec3 V = normalize(cameraPosition - pos);
        float fres = pow(1.0 - max(dot(V, n), 0.0), 2.2);

        /* Кривая по глубине: линейная шкала уводила почти всё озеро
           в тёмный край, и вода читалась как чёрная лужа. */
        float dd = pow(clamp(depth, 0.0, 1.0), 0.45);
        vec3 col = mix(uShallow, uDeep, dd);
        col = mix(col, uShallow * 1.5, fres * 0.5);

        /* Блик. Без него вода сверху — плоское пятно: волны меняют
           только нормаль, а без блика нормаль нечего показать. */
        vec3 L = normalize(vec3(0.45, 0.82, 0.36));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(n, H), 0.0), 60.0);
        col += vec3(1.0, 0.98, 0.92) * spec * 0.9;
        col += uShallow * pow(max(dot(n, H), 0.0), 6.0) * 0.3;

        /* Светлые полосы ряби по самой поверхности: дают движение
           даже там, где блик не попадает в кадр. Держим слабыми,
           иначе вода становится белой пеной. */
        float ripple = smoothstep(0.38, 0.98, h * 0.5 + 0.5);
        col = mix(col, uFoam, ripple * 0.16);

        /* Пена у берега */
        float shore = 1.0 - smoothstep(0.0, 0.42, depth);
        float foamNoise = vnoise(vWorld.xz * 2.4 + vec2(0.0, t * 1.8)) * 0.6
                        + vnoise(vWorld.xz * 5.2 - vec2(t * 1.3, 0.0)) * 0.4;
        float foam = shore * smoothstep(0.34, 0.72, foamNoise);
        col = mix(col, uFoam, foam * 0.8);

        float alpha = mix(0.6, 0.9, depth);
        alpha = max(alpha, foam * 0.92) * own;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.renderOrder = 2;
  mesh.userData.noShadow = true;
  return mesh;
}

/* ---------- лава: обычный блендинг, кора и трещины ---------- */
export function makeLava(heightTex, ownTex, level = LAVA_LEVEL, size = WORLD, depth = 6.0) {
  const geo = liquidPlane(size, 96);

  const cfg = base(OWN_LAVA, 1.6);
  const mat = new THREE.ShaderMaterial({
    ...cfg,
    uniforms: {
      ...cfg.uniforms,
      uHeight: { value: heightTex }, uOwn: { value: ownTex },
      uLevel: { value: level },
      uHot: { value: new THREE.Color(0xffb14e) },
      uMid: { value: new THREE.Color(0xe04a08) },
      uCrust: { value: new THREE.Color(0x2a1008) }
    },
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld; varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uHot, uMid, uCrust;
      ${OWN}
      ${NOISE}

      void main(){
        vec2 s = sampleLiquid();
        if(s.y <= 0.0) discard;
        float own = s.x, depth = s.y;

        vec2 p = vWorld.xz;
        /* Частоты под масштаб детали: на 22-единичном озере прежние
           0.13/0.26 давали меньше одного цикла — расплав был ровным
           оранжевым пятном без корки и разломов. */
        float flow1 = fbm(p * 0.62 + vec2(uTime * 0.14, uTime * 0.07));
        float flow2 = fbm(p * 1.35 - vec2(uTime * 0.10, uTime * 0.18));
        float heat = flow1 * 0.5 + flow2 * 0.5;
        heat = clamp((heat - 0.5) * 2.2 + 0.5, 0.0, 1.0);

        /* корка — тёмные острова, между ними светящиеся разломы */
        float crust = smoothstep(0.50, 0.72, heat);
        float crack = 1.0 - smoothstep(0.0, 0.11, abs(heat - 0.44));

        vec3 col = mix(uHot, uMid, smoothstep(0.10, 0.70, heat));
        col = mix(col, uCrust, crust * 0.94);
        col += uHot * crack * 0.85 * (1.0 - crust * 0.5);
        col *= mix(0.55, 1.0, depth);
        /* тёплое свечение по берегу — озеро выглядит жидким и горячим */
        col += uHot * (1.0 - smoothstep(0.0, 0.35, depth)) * 0.35;
        /* держим в пределах 1: иначе bloom выжигает озеро в белое пятно */
        col = min(col, vec3(1.0));

        gl_FragColor = vec4(col, mix(0.8, 0.98, depth) * own);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.renderOrder = 3;
  mesh.userData.noShadow = true;
  return mesh;
}

/* ---------- ядовитая жижа ---------- */
export function makeToxic(heightTex, ownTex, level = TOXIC_LEVEL, size = WORLD, depth = 3.6) {
  const geo = liquidPlane(size, 80);

  const cfg = base(OWN_TOXIC, 1.8);
  const mat = new THREE.ShaderMaterial({
    ...cfg,
    uniforms: {
      ...cfg.uniforms,
      uHeight: { value: heightTex }, uOwn: { value: ownTex },
      uLevel: { value: level },
      uFilm: { value: new THREE.Color(0x8ce020) },
      uDeep: { value: new THREE.Color(0x14220a) }
    },
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld; varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uFilm, uDeep;
      ${OWN}
      ${NOISE}

      void main(){
        vec2 s = sampleLiquid();
        if(s.y <= 0.0) discard;
        float own = s.x, depth = s.y;

        float t = uTime * 0.3;
        /* Частоты под масштаб котловины: прежние 0.45/0.95 давали
           почти ровную заливку без пузырей и плёнки. */
        float n = fbm(vWorld.xz * 1.15 + vec2(0.0, t)) * 0.62
                + fbm(vWorld.xz * 2.60 - vec2(t, 0.0)) * 0.38;
        n = clamp((n - 0.5) * 1.8 + 0.5, 0.0, 1.0);
        float bubbles = smoothstep(0.56, 0.80, n);

        vec3 col = mix(uDeep, uFilm, smoothstep(0.28, 0.68, n) * 0.7);
        col = mix(col, uFilm * 1.4, bubbles * 0.9);
        /* светящаяся кромка — слизь светится изнутри */
        col += uFilm * (1.0 - smoothstep(0.0, 0.4, depth)) * 0.5;
        col *= mix(0.6, 1.0, depth);

        gl_FragColor = vec4(col, mix(0.85, 0.97, depth) * own);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.renderOrder = 3;
  mesh.userData.noShadow = true;
  return mesh;
}
