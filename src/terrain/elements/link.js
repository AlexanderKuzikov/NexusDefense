import * as THREE from 'three';
import { defineElement, KIND, smoothstep, clamp } from './contract.js';

/* =============================================================
   ДОРОЖНЫЕ ПЕРЕМЫЧКИ
   Дорога принадлежит компоновщику карты. Эти элементы — не дорога,
   а то, что ей нужно там, где она пересекает препятствие: насыпь
   через низину и мост через воду. Ставятся поверх уже проложенного
   полотна, поэтому canPlaceAt требует, чтобы дорога проходила рядом.
   ============================================================= */

const ROAD_W = 3.2;

/* ---------- НАСЫПЬ ---------- */
export const causeway = defineElement({
  id: 'causeway', name: 'Насыпь', kind: KIND.LINK,
  tags: ['link', 'road'],
  radius: 16, core: 11, cost: 1, profile: 'flat',
  note: 'Приподнимает полотно над низиной. Ставится там, где дорога тонет.',
  shape: (dx, dz) => Math.hypot(dx * 0.62, dz * 1.5),
  heightAt: (x, z, base, t, p) => {
    /* поднимаем только там, где полотно ниже целевой отметки,
       и только в узкой полосе вдоль дороги */
    const target = p.anchorY + p.raise;
    if (base >= target) return 0;
    return (target - base) * (1 - smoothstep(0.35, 1.0, t));
  },
  canPlaceAt: ctx => !ctx.distRoad
    ? { ok: false, why: 'насыпь ставится только на дороге' }
    : ctx.distRoad > ROAD_W * 2.5
      ? { ok: false, why: 'слишком далеко от дороги' }
      : { ok: true },
  defaults: { raise: 2.2 },
  build: p => {
    const size = causeway.core * 2;
    const geo = new THREE.PlaneGeometry(size, size * 0.7, 26, 18);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      /* ровное полотно с откосами — насыпь строится от целевой отметки */
      const t = clamp(Math.hypot(x * 0.62, z * 1.5) / causeway.core, 0, 1);
      pos.setY(k, p.raise * (1 - smoothstep(0.3, 1.0, t)));
    }
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x3a3f45, roughness: .9, metalness: .1, flatShading: true
    })));
    /* бордюрные ленты — те же, что на готовой дороге */
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(
        new THREE.BoxGeometry(causeway.core * 1.8, 0.1, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x36d0ff })
      );
      l.position.set(0, p.raise + 0.16, side * ROAD_W * 0.5);
      g.add(l);
    }
    return g;
  }
});

/* ---------- МОСТ ---------- */
export const bridge = defineElement({
  id: 'bridge', name: 'Мост', kind: KIND.LINK,
  tags: ['link', 'road', 'water'],
  radius: 18, core: 13, cost: 3, profile: 'step',
  shape: (dx, dz) => Math.hypot(dx * 0.62, dz * 1.5),
  note: 'Перебрасывает дорогу через воду. Пролёт не трогает жидкость.',
  /* мост ничего не красит и почти не меняет рельеф: устои стоят
     на дне, настил идёт над уровнем воды */
  heightAt: (x, z, base, t, p) => {
    const along = Math.abs(x) / (bridge.core * 0.62);
    if (along > 1) return 0;
    /* два устоя по краям пролёта */
    const pier = 1 - smoothstep(0.0, 0.18, Math.abs(along - 0.82));
    return p.deckHeight * pier;
  },
  canPlaceAt: ctx => !ctx.distRoad
    ? { ok: false, why: 'мост ставится только на дороге' }
    : !ctx.overLiquid
      ? { ok: false, why: 'под дорогой нет воды' }
      : { ok: true },
  defaults: { deckHeight: 4.0, span: 9 },
  build: p => {
    const g = new THREE.Group();
    const L = p.span * 2;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a3038, roughness: .7, metalness: .35, flatShading: true
    });
    /* настил */
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, ROAD_W + 0.6), mat);
    deck.position.y = p.deckHeight;
    deck.castShadow = true;
    g.add(deck);
    /* устои */
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, p.deckHeight + 1.5, 1.2), mat);
      pier.position.set(s * p.span, (p.deckHeight - 1.5) / 2, 0);
      g.add(pier);
    }
    /* перила */
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(L, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x36d0ff })
      );
      rail.position.set(0, p.deckHeight + 0.6, s * (ROAD_W * 0.5 + 0.25));
      g.add(rail);
    }
    /* опоры под настилом */
    for (let k = -2; k <= 2; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, ROAD_W + 0.4), mat);
      beam.position.set(k * (L / 5), p.deckHeight - 0.55, 0);
      g.add(beam);
    }
    return g;
  }
});

export const LINKS = [causeway, bridge];
