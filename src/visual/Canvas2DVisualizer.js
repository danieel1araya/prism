import { lerp3 } from './Palette.js';

// ── Canvas2DVisualizer ────────────────────────────────────
// Handles all 2D canvas drawing: particles, scope, ripple, spectrum.

const MAX_PARTS_DESKTOP = 400;
const MAX_PARTS_MOBILE  = 150;
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || innerWidth < 600;

export class Canvas2DVisualizer {
  constructor({ bg2dCanvas, particleCanvas, specCanvas }) {
    this.bg2dCanvas   = bg2dCanvas;
    this.particleCanvas = particleCanvas;
    this.specCanvas   = specCanvas;
    this.d2Ctx  = bg2dCanvas.getContext('2d');
    this.pCtx   = particleCanvas.getContext('2d');
    this.sCtx   = specCanvas.getContext('2d');

    this._maxParts = IS_MOBILE ? MAX_PARTS_MOBILE : MAX_PARTS_DESKTOP;
    this._parts    = [];
    this._ripples  = [];

    // Pre-spawn ambient particles
    for (let i = 0; i < 150; i++) this._parts.push(this._spawnPart());
  }

  // ── Public API ─────────────────────────────────────────

  drawSpectrum(audio, palette) {
    const { sCtx, specCanvas: { width: W, height: H } } = this;
    sCtx.clearRect(0, 0, W, H);
    if (!audio.freqData) return;
    const { bands, beat } = audio;
    const bw = W / 32;
    for (let i = 0; i < 32; i++) {
      const val = bands[i], t = i / 32;
      const r = Math.round(lerp3(palette.colors[0].r, palette.colors[1].r, palette.colors[2].r, t) * 255);
      const g = Math.round(lerp3(palette.colors[0].g, palette.colors[1].g, palette.colors[2].g, t) * 255);
      const b = Math.round(lerp3(palette.colors[0].b, palette.colors[1].b, palette.colors[2].b, t) * 255);
      const a = 0.45 + val * .55, h = val * H * .88;
      sCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
      sCtx.fillRect(i * bw, H - h, bw - 2, h);
      const grd = sCtx.createLinearGradient(0, H - h - 16, 0, H - h);
      grd.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grd.addColorStop(1, `rgba(${r},${g},${b},${a})`);
      sCtx.fillStyle = grd;
      sCtx.fillRect(i * bw, H - h - 16, bw - 2, 16);
      if (beat && i < 3) { sCtx.fillStyle = 'rgba(255,255,255,0.9)'; sCtx.fillRect(i * bw, H - h - 4, bw - 2, 4); }
    }
  }

  drawScope(audio, palette) {
    const { d2Ctx: ctx, bg2dCanvas: { width: W, height: H } } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, W, H);
    if (!audio.waveData) return;
    const { waveData, energy, bassPulse, beat, bands, beatKick, anticipate } = audio;
    const cx = W / 2, cy = H / 2;

    for (let layer = 0; layer < 3; layer++) {
      const scale = 0.5 + energy * .35 + layer * .1 + anticipate * .08 + beatKick * .12;
      const c = palette.colors[layer % 3];
      const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.9 - layer * .22})`;
      ctx.lineWidth   = 2.5 - layer * .5 + beatKick * 2;
      ctx.shadowBlur  = 18 - layer * 5 + beatKick * 20;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      for (let i = 0; i < waveData.length; i++) {
        const angle = (i / waveData.length) * Math.PI * 2;
        const amp   = (waveData[i] / 128 - 1) * H * .2 * scale * (1 + bassPulse * 2.0);
        const rad   = H * .26 * scale + amp;
        i === 0 ? ctx.moveTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad)
                : ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
      }
      ctx.closePath(); ctx.stroke();
    }

    if (beat) {
      const c = palette.colors[0];
      const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * .22);
      grd.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, H * .22, 0, Math.PI * 2); ctx.fill();
    }

    if (energy > 0.04) {
      const baseR = Math.min(W, H) * .35;
      ctx.save();
      for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2 - Math.PI / 2;
        const barH  = bands[i] * Math.min(W, H) * .11; if (barH < 1) continue;
        const t = i / 32;
        const br = Math.round(lerp3(palette.colors[0].r, palette.colors[1].r, palette.colors[2].r, t) * 255);
        const bg = Math.round(lerp3(palette.colors[0].g, palette.colors[1].g, palette.colors[2].g, t) * 255);
        const bb = Math.round(lerp3(palette.colors[0].b, palette.colors[1].b, palette.colors[2].b, t) * 255);
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${0.5 + bands[i] * .5})`;
        ctx.lineWidth   = 3;
        ctx.shadowBlur  = 6 + bands[i] * 12 + beatKick * 8;
        ctx.shadowColor = `rgb(${br},${bg},${bb})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * baseR,         cy + Math.sin(angle) * baseR);
        ctx.lineTo(cx + Math.cos(angle) * (baseR + barH), cy + Math.sin(angle) * (baseR + barH));
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  drawRipple(audio, palette) {
    const { d2Ctx: ctx, bg2dCanvas: { width: W, height: H } } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, W, H);
    if (!audio.freqData) return;
    const { bands, beat, energy, waveData, bassPulse, beatKick } = audio;

    for (let i = 0; i < 32; i++) {
      if (bands[i] > 0.45 && Math.random() < 0.35) {
        const t = i / 32;
        this._ripples.push({
          x: Math.random() * W, y: Math.random() * H, r: 0,
          maxR: 80 + bands[i] * 220, alpha: bands[i] * .7,
          cr: Math.round(lerp3(palette.colors[0].r, palette.colors[1].r, palette.colors[2].r, t) * 255),
          cg: Math.round(lerp3(palette.colors[0].g, palette.colors[1].g, palette.colors[2].g, t) * 255),
          cb: Math.round(lerp3(palette.colors[0].b, palette.colors[1].b, palette.colors[2].b, t) * 255),
        });
      }
    }
    if (beat) this._ripples.push({
      x: W / 2, y: H / 2, r: 0, maxR: Math.max(W, H), alpha: 0.9,
      cr: Math.round(palette.colors[0].r * 255),
      cg: Math.round(palette.colors[0].g * 255),
      cb: Math.round(palette.colors[0].b * 255),
    });

    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const rp = this._ripples[i];
      rp.r += 4 + energy * 16; rp.alpha *= 0.94;
      if (rp.r > rp.maxR || rp.alpha < 0.01) { this._ripples.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rp.cr},${rp.cg},${rp.cb},${rp.alpha})`;
      ctx.lineWidth   = 2 * (1 - rp.r / rp.maxR); ctx.stroke();
    }

    if (waveData) {
      ctx.beginPath();
      for (let i = 0; i < waveData.length; i++) {
        const x = (i / waveData.length) * W;
        const y = H / 2 + (waveData[i] / 128 - 1) * H * .22 * (1 + bassPulse * 2.5 + beatKick * 1.5);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const c = palette.colors[2];
      const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.lineWidth   = 1.5 + beatKick * 2;
      ctx.shadowBlur  = 8 + beatKick * 12;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  updateParticles(audio, palette, is2D) {
    const { pCtx, particleCanvas: { width: W, height: H } } = this;
    pCtx.clearRect(0, 0, W, H);
    if (is2D) return;

    const { beat, energy, anticipate, beatKick } = audio;
    const cx = innerWidth * .5, cy = innerHeight * .52;
    const spread = innerWidth * .45;

    if (beat) {
      const burst = IS_MOBILE ? 8 + Math.floor(energy * 6) : 20 + Math.floor(energy * 15);
      for (let i = 0; i < burst && this._parts.length < this._maxParts; i++)
        this._parts.push(this._spawnPart(cx + (Math.random() - .5) * spread * .3, cy + (Math.random() - .5) * innerHeight * .2, true));
    }
    if (anticipate > 0.5 && Math.random() < anticipate * .4)
      for (let i = 0; i < 3 && this._parts.length < this._maxParts; i++)
        this._parts.push(this._spawnPart(cx + (Math.random() - .5) * spread * .6, cy + (Math.random() - .5) * innerHeight * .3));
    if (energy > 0.22 && Math.random() < energy * .5)
      for (let i = 0; i < 2 && this._parts.length < this._maxParts; i++)
        this._parts.push(this._spawnPart(cx + (Math.random() - .5) * spread, cy + (Math.random() - .5) * innerHeight * .4));

    for (let i = this._parts.length - 1; i >= 0; i--) {
      const p = this._parts[i];
      p.life += .011;
      if (p.life > p.maxLife) { this._parts.splice(i, 1); continue; }
      p.vx += (Math.random() - .5) * .08 * (1 + energy * 3);
      p.vy += -0.012 - energy * .04;
      p.vx *= 0.982; p.vy *= 0.982;
      p.x  += p.vx;  p.y  += p.vy;
      const prog  = p.life / p.maxLife;
      const alpha = Math.sin(prog * Math.PI) * (p.glow ? 0.90 : 0.48);
      const c = palette.colors[p.ci];
      const [r, g, b] = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
      pCtx.save();
      if (p.glow) { pCtx.shadowBlur = 10 + energy * 20 + beatKick * 12; pCtx.shadowColor = `rgb(${r},${g},${b})`; }
      pCtx.globalAlpha = alpha;
      pCtx.fillStyle   = `rgb(${r},${g},${b})`;
      pCtx.beginPath(); pCtx.arc(p.x, p.y, p.size * (1 - prog * .4), 0, Math.PI * 2); pCtx.fill();
      pCtx.restore();
    }
  }

  clear2D() {
    this.d2Ctx.fillStyle = '#000';
    this.d2Ctx.fillRect(0, 0, this.bg2dCanvas.width, this.bg2dCanvas.height);
    this.pCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);
  }

  // ── Private ────────────────────────────────────────────
  _spawnPart(x, y, fast = false) {
    const a = Math.random() * Math.PI * 2;
    const s = fast ? 1.2 + Math.random() * 3.0 : 0.4 + Math.random() * 1.4;
    return {
      x: x ?? Math.random() * innerWidth,
      y: y ?? Math.random() * innerHeight,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0,
      maxLife: fast ? 0.5 + Math.random() * 1.2 : 0.8 + Math.random() * 2.2,
      size: fast ? 2 + Math.random() * 4 : 1 + Math.random() * 2.5,
      ci:   Math.floor(Math.random() * 3),
      glow: fast ? true : Math.random() > 0.55,
    };
  }
}
