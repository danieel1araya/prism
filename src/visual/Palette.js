import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ── Palette ───────────────────────────────────────────────
// Extracts dominant colors from album art and animates transitions.

export class Palette {
  constructor() {
    this.colors = [
      new THREE.Color('#ff3cac'),
      new THREE.Color('#784ba0'),
      new THREE.Color('#2b86c5'),
    ];
    this._target = this.colors.map(c => c.clone());
    this._mix    = 1.0;
  }

  /** Call each frame to interpolate toward target palette */
  tick() {
    if (this._mix >= 1) return;
    this._mix = Math.min(1, this._mix + 0.004);
    for (let i = 0; i < 3; i++) {
      this.colors[i] = new THREE.Color(
        this.colors[i].r + (this._target[i].r - this.colors[i].r) * this._mix,
        this.colors[i].g + (this._target[i].g - this.colors[i].g) * this._mix,
        this.colors[i].b + (this._target[i].b - this.colors[i].b) * this._mix,
      );
    }
  }

  /** Extract palette from a loaded HTMLImageElement */
  extractFromImage(img) {
    const SZ  = 80;
    const can = document.createElement('canvas');
    can.width = can.height = SZ;
    const ctx = can.getContext('2d');
    ctx.drawImage(img, 0, 0, SZ, SZ);
    const data = ctx.getImageData(0, 0, SZ, SZ).data;

    let samples = [];
    for (let i = 0; i < SZ * SZ; i++) {
      const idx = i * 4;
      const r = data[idx] / 255, g = data[idx + 1] / 255, b = data[idx + 2] / 255;
      const brightness = (r + g + b) / 3;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (brightness > 0.85 || brightness < 0.08 || sat < 0.18) continue;
      samples.push([r, g, b, sat]);
    }

    if (samples.length < 10) {
      for (let i = 0; i < SZ * SZ; i += 4) {
        const idx = i * 4;
        const r = data[idx] / 255, g = data[idx + 1] / 255, b = data[idx + 2] / 255;
        const brightness = (r + g + b) / 3;
        if (brightness > 0.92 || brightness < 0.04) continue;
        samples.push([r, g, b, 0]);
      }
    }

    samples.sort((a, b) => b[3] - a[3]);
    const pool   = samples.slice(0, Math.min(samples.length, 80));
    const picked = [pool[0]];
    for (let iter = 0; iter < 2; iter++) {
      let best = 0, bs = pool[0];
      for (const s of pool) {
        let md = Infinity;
        for (const pp of picked)
          md = Math.min(md, Math.hypot(s[0] - pp[0], s[1] - pp[1], s[2] - pp[2]));
        if (md > best) { best = md; bs = s; }
      }
      picked.push(bs);
    }

    this._target = picked.map(([r, g, b]) => {
      const mx = Math.max(r, g, b, 0.01);
      const k  = mx < .25 ? .4 : .1;
      let nr = Math.min(r / mx * .9 + k, 1);
      let ng = Math.min(g / mx * .9 + k, 1);
      let nb = Math.min(b / mx * .9 + k, 1);
      const bri = (nr + ng + nb) / 3;
      if (bri > 0.72) { const sc = 0.72 / bri; nr *= sc; ng *= sc; nb *= sc; }
      return new THREE.Color(nr, ng, nb);
    });

    this._mix = 0;
  }

  /** Apply current palette to a Three.js ShaderMaterial uniforms */
  applyToUniforms(u) {
    u.c1.value.copy(this.colors[0]);
    u.c2.value.copy(this.colors[1]);
    u.c3.value.copy(this.colors[2]);
  }
}

// Linear interpolation across 3 color components
export function lerp3(a, b, c, t) {
  return t < .5 ? a + (b - a) * (t * 2) : b + (c - b) * ((t - .5) * 2);
}
