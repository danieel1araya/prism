// ── Audio Engine ─────────────────────────────────────────
// Handles Web Audio API, frequency analysis, BPM detection

const FFT = 2048;
const BANDS = 32;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.element = null;

    this.freqData = null;
    this.waveData = null;

    // Smoothed frequency bands
    this.bands = new Float32Array(BANDS);
    this.bandsRaw = new Float32Array(BANDS);

    // Per-range values
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.bassSmooth = 0;
    this.midSmooth = 0;
    this.highSmooth = 0;
    this.bassAvg = 80;

    // Derived visualizer values (read by visualizer each frame)
    this.bassPulse = 0;
    this.energy = 0;
    this.beat = false;
    this.beatCool = 0;
    this.flash = 0;

    // BPM
    this._beatTimes = [];
    this.bpm = 0;
    this.bpmPhase = 0;
    this.bpmInterval = 500;
    this.anticipate = 0;
    this.beatKick = 0;
    this._lastBeatTime = 0;
  }

  reset() {
    this._beatTimes = [];
    this.bpm = 0;
    this.bpmPhase = 0;
    this.bpmInterval = 500;
    this.anticipate = 0;
    this.beatKick = 0;
    this._lastBeatTime = 0;
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.bassSmooth = 0;
    this.midSmooth = 0;
    this.highSmooth = 0;
    this.bassAvg = 80;
    this.bassPulse = 0;
    this.energy = 0;
    this.beat = false;
    this.beatCool = 0;
    this.flash = 0;
    this.bands.fill(0);
    this.bandsRaw.fill(0);
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT;
    this.analyser.smoothingTimeConstant = 0.75;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.connect(this.ctx.destination);
  }

  async play(previewUrl) {
    this.reset();
    await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    if (this.element) {
      this.element.pause();
      this.element.src = "";
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (_) {}
      this.source = null;
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audio.src = previewUrl;
    this.element = audio;

    await new Promise((res, rej) => {
      audio.addEventListener("canplay", res, { once: true });
      audio.addEventListener("error", rej, { once: true });
      audio.load();
    });

    this.source = this.ctx.createMediaElementSource(audio);
    this.source.connect(this.analyser);
    await audio.play();
  }

  tick(now) {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.waveData);

    const n = this.freqData.length;
    for (let b = 0; b < BANDS; b++) {
      const lo = Math.floor(n * Math.pow(b / BANDS, 1.8) * 0.5);
      const hi = Math.floor(n * Math.pow((b + 1) / BANDS, 1.8) * 0.5);
      let val = 0;
      for (let i = lo; i < Math.max(lo + 1, hi); i++)
        val += this.freqData[i] || 0;
      this.bandsRaw[b] = val / Math.max(1, hi - lo) / 255;
      this.bands[b] += (this.bandsRaw[b] - this.bands[b]) * 0.18;
    }

    this.bass = _avg(this.freqData, 0, Math.floor(n * 0.03));
    this.mid = _avg(this.freqData, Math.floor(n * 0.03), Math.floor(n * 0.18));
    this.high = _avg(this.freqData, Math.floor(n * 0.18), Math.floor(n * 0.55));

    this.bassSmooth += (this.bass - this.bassSmooth) * 0.15;
    this.midSmooth += (this.mid - this.midSmooth) * 0.12;
    this.highSmooth += (this.high - this.highSmooth) * 0.1;
    this.bassAvg += (this.bass - this.bassAvg) * 0.04;

    this.bassPulse = Math.max(0, this.bass - this.bassAvg) / 255;
    this.energy =
      (this.bassSmooth * 0.6 + this.midSmooth * 0.3 + this.highSmooth * 0.1) /
      255;

    this.beatCool = Math.max(0, this.beatCool - 1);
    this.beat =
      this.bass > this.bassAvg * 1.35 && this.bass > 75 && this.beatCool === 0;
    if (this.beat) this.beatCool = 18;

    this._tickBPM(now);
  }

  _tickBPM(now) {
    this.beatKick = Math.max(0, this.beatKick * 0.75);

    if (!this.beat) {
      this.bpmPhase = Math.min(
        1,
        (now - this._lastBeatTime) / this.bpmInterval,
      );
      this.anticipate = Math.max(0, (this.bpmPhase - 0.8) / 0.2);
      return;
    }

    this.beatKick = 1.0;
    this._beatTimes.push(now);
    if (this._beatTimes.length > 32) this._beatTimes.shift();

    if (this._beatTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < this._beatTimes.length; i++)
        intervals.push(this._beatTimes[i] - this._beatTimes[i - 1]);
      const lo = this.bpmInterval * 0.6,
        hi = this.bpmInterval * 1.4;
      const clean = intervals.filter((v) => v > lo && v < hi);
      const src = clean.length >= 2 ? clean : intervals;
      const rawAvg = src.reduce((a, b) => a + b, 0) / src.length;
      if (rawAvg > 250 && rawAvg < 1200) {
        const err = Math.abs(rawAvg - this.bpmInterval) / this.bpmInterval;
        this.bpmInterval +=
          (rawAvg - this.bpmInterval) * Math.min(0.5, 0.15 + err * 0.6);
        this.bpm = Math.round(60000 / this.bpmInterval);
      }
    }

    this._lastBeatTime = now;
    this.bpmPhase = 0;
    this.anticipate = 0;
  }
}

function _avg(arr, lo, hi) {
  let s = 0;
  for (let i = lo; i < hi; i++) s += arr[i] || 0;
  return s / Math.max(1, hi - lo);
}
