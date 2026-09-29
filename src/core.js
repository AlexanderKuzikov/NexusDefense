import * as THREE from 'three';

/* Общие помощники: материалы, эффекты, окружение.
   Общий язык с towers.html — та же палитра и тот же рендер-пайплайн. */

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const hex = n => '#' + n.toString(16).padStart(6, '0');
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/* --- материалы --- */
export const metal = (color = 0x2b333f, m = 0.68, r = 0.42) => {
  const c = new THREE.Color(color).lerp(new THREE.Color(0x8d99a8), .36);
  return new THREE.MeshStandardMaterial({ color: c, metalness: Math.min(m, .58), roughness: r });
};

export const neon = (color, i = 2.6) => new THREE.MeshStandardMaterial({
  color: 0x080c12, emissive: new THREE.Color(color), emissiveIntensity: i * .42,
  metalness: .25, roughness: .45
});

export const glassMat = color => new THREE.MeshPhysicalMaterial({
  color, metalness: 0, roughness: .06, transmission: .9, thickness: .7,
  ior: 1.8, clearcoat: 1, clearcoatRoughness: .05, transparent: true
});

export const wireMat = (color, opacity = .55) => new THREE.MeshBasicMaterial({
  color, wireframe: true, transparent: true, opacity,
  blending: THREE.AdditiveBlending, depthWrite: false
});

/* мягкая круглая точка — без неё Points рисует серые квадраты */
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.35, 'rgba(255,255,255,.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export const dotMat = (color, size, opacity = 1) => new THREE.PointsMaterial({
  color, size, map: dotTex, transparent: true, opacity,
  blending: THREE.AdditiveBlending, depthWrite: false
});

export const addShadow = root => root.traverse(o => {
  if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; }
});

/* canvas-текстура с номером/меткой */
export const labelTex = (text, color, size = 82) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.font = `bold ${size}px ui-monospace, Consolas, monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = hex(color); x.globalAlpha = .9;
  x.fillText(text, 128, 66);
  x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 1;
  for (let y = 0; y < 128; y += 3) { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, y, 256, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};

/* ===================== сцена ===================== */
export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x05070c, 0.0075);

  /* окружение для отражений: тёмное, с цветными панелями */
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = normalize(vP).y*.5+.5;
        gl_FragColor = vec4(mix(vec3(0.04,0.055,0.08), vec3(0.16,0.28,0.44), pow(h,1.4)), 1.);
      }`
    })
  ));
  const pnl = (col, pos, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(...pos); m.lookAt(0, 0, 0); es.add(m);
  };
  pnl(0x2f7fb8, [-8, 5, 0], 8, 5);
  pnl(0xa02878, [8, 4, 0], 8, 5);
  pnl(0x1d6b7a, [0, 9, 0], 9, 9);
  pnl(0x4a5a30, [0, -6, 6], 12, 6);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(es, .03).texture;
  pm.dispose();

  scene.add(new THREE.HemisphereLight(0x6fa8d8, 0x141c28, .8));
  const key = new THREE.DirectionalLight(0xcfe8ff, 1.9);
  key.position.set(14, 26, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 4; key.shadow.camera.far = 90;
  key.shadow.camera.left = -32; key.shadow.camera.right = 32;
  key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
  key.shadow.bias = -.0007;
  scene.add(key);
  const f1 = new THREE.PointLight(0x35e0ff, 30, 60, 2); f1.position.set(-18, 6, 12); scene.add(f1);
  const f2 = new THREE.PointLight(0xff4fd8, 22, 60, 2); f2.position.set(18, 7, -10); scene.add(f2);

  /* пол */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), metal(0x070a10, .72, .4));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  scene.add(gridPlane(140, 1, 0x2f7fb8, .22), gridPlane(140, 5, 0x35e0ff, .42));

  /* пыль */
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rnd(-50, 50); pos[i * 3 + 1] = rnd(.2, 18); pos[i * 3 + 2] = rnd(-36, 36);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(g, dotMat(0x6fb6e0, .3, .5));
  scene.add(dust);

  return { scene, dust, dustGeo: g };
}

function gridPlane(size, cell, color, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCell: { value: cell }, uFade: { value: 50 }, uOp: { value: opacity }
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; uniform vec3 uColor; uniform float uCell; uniform float uFade; uniform float uOp;
      void main(){
        vec2 p = vW.xz/uCell;
        vec2 g = abs(fract(p-.5)-.5)/max(fwidth(p), vec2(1e-4));
        float l = 1.-min(min(g.x,g.y),1.);
        float d = 1.-smoothstep(0.,uFade,length(vW.xz));
        float a = l*d*uOp;
        if(a<0.002) discard;
        gl_FragColor = vec4(uColor, a);
      }`
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = .012; m.renderOrder = 1; m.userData.noShadow = true;
  return m;
}

/* ===================== боевые эффекты ===================== */
export const liveFx = [];

export function beam(scene, color, rCore = .05, rHalo = .16) {
  const g = new THREE.Group();
  const mk = (r, op) => {
    const geo = new THREE.CylinderGeometry(r, r, 1, 8, 1, true);
    geo.translate(0, .5, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    }));
    m.userData.noShadow = true; m.renderOrder = 4;
    return m;
  };
  const core = mk(rCore, 1), halo = mk(rHalo, .34);
  g.add(core, halo);
  g.userData = { core, halo };
  g.visible = false;
  scene.add(g);
  return g;
}

export function alignBeam(b, from, to) {
  b.position.copy(from);
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  b.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  b.scale.set(1, len, 1);
}

export function fireBeam(b, from, to, dur = .18, grow = 5) {
  alignBeam(b, from, to);
  b.visible = true;
  liveFx.push({
    t: 0, dur, step(p) {
      const w = p < .12 ? p / .12 : 1 - (p - .12) / .88 * .55;
      b.userData.core.material.opacity = w;
      b.userData.halo.material.opacity = w * .34;
      const s = 1 + p * grow;
      b.userData.halo.scale.set(s, 1, s);
    },
    done() { b.visible = false; b.userData.halo.scale.set(1, 1, 1); }
  });
}

export function fxCone(scene, color) {
  const geo = new THREE.ConeGeometry(1, 1, 20, 1, true);
  geo.translate(0, -.5, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide
  }));
  m.userData.noShadow = true; m.renderOrder = 4; m.visible = false;
  scene.add(m);
  return m;
}

export function arcFx(scene, count, color) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const l = new THREE.Line(geo, mat);
    l.userData.noShadow = true; l.renderOrder = 5;
    g.add(l);
  }
  scene.add(g);
  return {
    zap(a, b, life = .16) {
      g.children.forEach(l => {
        const p = l.geometry.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
          const t = i / 3 / 14;
          p[i] = lerp(a.x, b.x, t) + (i ? rnd(-.16, .16) : 0);
          p[i + 1] = lerp(a.y, b.y, t) + rnd(-.2, .2);
          p[i + 2] = lerp(a.z, b.z, t) + (i ? rnd(-.16, .16) : 0);
        }
        l.geometry.attributes.position.needsUpdate = true;
      });
      g.visible = true;
      liveFx.push({
        t: 0, dur: life, step(p) { mat.opacity = p < .25 ? 1 : 1 - (p - .25) / .75; },
        done() { g.visible = false; }
      });
    }
  };
}

export function burst(scene, color, from, n = 26, spread = 1.6, size = .22) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos.set([from.x, from.y, from.z], i * 3);
    vel.push(V(rnd(-1, 1), rnd(-.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(.8, 3) * spread));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, dotMat(color, size, 1));
  p.position.copy(from);
  scene.add(p);
  liveFx.push({
    t: 0, dur: .7, step(t) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        vel[i].y -= 7 * t * .016;
        a[i * 3] += vel[i].x * .016; a[i * 3 + 1] += vel[i].y * .016; a[i * 3 + 2] += vel[i].z * .016;
      }
      geo.attributes.position.needsUpdate = true;
      p.material.opacity = 1 - t;
      p.material.size = size * (1 - t * .6);
    },
    done() { scene.remove(p); geo.dispose(); p.material.dispose(); }
  });
}

export function stepFx(dt) {
  for (let i = liveFx.length - 1; i >= 0; i--) {
    const f = liveFx[i];
    f.t += dt;
    f.step(Math.min(1, f.t / f.dur), dt);
    if (f.t >= f.dur) { f.done(); liveFx.splice(i, 1); }
  }
}
