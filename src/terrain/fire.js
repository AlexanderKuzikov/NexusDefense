import * as THREE from 'three';

/* Огонь и дым — частицы для горящего леса.
   Вынесено отдельным модулем, потому что нужно и карте (props.js),
   и набору элементов (elements/biome.js). Одна реализация на оба.

   Вся анимация — в вершинном шейдере по фазе частицы: CPU на кадре
   не трогает буферы, а движение всё равно живое.
   */
/* ---------- огонь и дым над выжженным лесом ----------
   Частицы анимируются целиком в вершинном шейдере по фазе: CPU на
   каждом кадре не трогает буферы, а движение всё равно живое. */

const FIRE_VERT = /* glsl */`
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform float uRise;
  uniform float uPix;
  varying float vLife;
  varying float vSeed;
  void main(){
    float life = fract(uTime * 0.5 + aPhase);
    vLife = life;
    vSeed = aPhase;
    vec3 p = position;
    p.y += life * uRise;
    /* лёгкое блуждание по ветру, чтобы столб не шёл идеально ровно */
    p.x += sin(uTime * 1.3 + aPhase * 6.28) * life * 0.9;
    p.z += cos(uTime * 1.1 + aPhase * 5.13) * life * 0.7;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float shrink = mix(1.0, 0.25, life);
    /* aScale — мировой размер частицы. uPix переводит его в пиксели
       для текущей камеры, поэтому огонь не схлопывается на других
       масштабах сцены (галерея элементов и карта 200×200). */
    gl_PointSize = aScale * shrink * uPix / max(-mv.z, 0.5);
    gl_Position = projectionMatrix * mv;
  }
`;

export const FIRE_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uHot, uMid, uCold;
  uniform float uIntensity;
  varying float vLife;
  varying float vSeed;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if(r > 0.5) discard;
    float soft = smoothstep(0.5, 0.06, r);
    /* внизу жарко и светло, вверху остывает */
    vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.55, vLife));
    col = mix(col, uCold, smoothstep(0.55, 1.0, vLife));
    float a = soft * (1.0 - smoothstep(0.55, 1.0, vLife)) * uIntensity;
    /* мерцание, чтобы огонь не выглядел статичной плёнкой */
    a *= 0.75 + 0.25 * sin(vSeed * 40.0 + vLife * 18.0);
    gl_FragColor = vec4(col, a);
  }
`;

export const SMOKE_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vLife;
  varying float vSeed;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if(r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    float a = soft * (1.0 - vLife) * uIntensity * 0.5;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Огонь/дым над набором точек.
 * spots — массив [x, z, rot] (тот же формат, что отдаёт props()).
 * Высоту земли берём из cfg.yOf(x, z), чтобы огонь сел на рельеф
 * независимо от того, кто его ставит: карта или набор элементов.
 */
export function makeFireSystem(spots, cfg) {
  const n = spots.length * cfg.perTree;
  if (!n) return null;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const scale = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < spots.length; i++) {
    const [x, z, rot] = spots[i];
    const ground = cfg.yOf ? cfg.yOf(x, z) : 0;
    for (let j = 0; j < cfg.perTree; j++) {
      const a = (j / cfg.perTree) * Math.PI * 2 + (rot || 0) * 6.28;
      const rad = j === 0 ? 0 : cfg.spread * (0.4 + ((j * 0.37) % 1));
      p[k * 3] = x + Math.cos(a) * rad;
      p[k * 3 + 1] = ground + cfg.base;
      p[k * 3 + 2] = z + Math.sin(a) * rad;
      phase[k] = (j / cfg.perTree) + (rot || 0) * 0.61;
      scale[k] = cfg.size * (0.6 + ((j * 0.53) % 1) * 0.8);
      k++;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: FIRE_VERT,
    fragmentShader: cfg.frag,
    transparent: true, depthWrite: false,
    blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uRise: { value: cfg.rise },
      uPix: { value: 800 },
      uIntensity: { value: cfg.intensity },
      uHot: { value: new THREE.Color(cfg.hot) },
      uMid: { value: new THREE.Color(cfg.mid) },
      uCold: { value: new THREE.Color(cfg.cold) },
      uColor: { value: new THREE.Color(cfg.color || 0xffffff) }
    }
  });

  /* Пересчитываем масштаб частиц под текущую камеру. Сделано здесь,
     а не в страницах: и карта, и галерея получают верный размер
     без единой строки кода на их стороне. */
  mat.onBeforeRender = (rndr, scn, cam) => {
    if (!cam.isPerspectiveCamera) return;
    const h = rndr.getSize ? rndr.getSize(new THREE.Vector2()).y : 800;
    mat.uniforms.uPix.value = h / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
  };

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.mat = mat;
  return points;
}

