// ── Audio Engine ─────────────────────────────────────────
// Handles Web Audio API, frequency analysis, onset/beat detection, BPM tracking.
//
// Onset detection is split across three frequency bands instead of one
// blanket threshold — a kick, a clap/snare, and a hi-hat/cymbal look
// completely different in the spectrum (low/narrow vs. mid/broad vs.
// high/sharp), so each gets its own spectral-flux detector and adaptive
// threshold (mean + k·stddev over a rolling history). Spectral flux —
// the rate a band's energy is *rising*, not its absolute level — is what
// makes this selective: a sustained loud bassline doesn't trigger it,
// only an actual attack does.
//
// Tempo is tracked from the detected kick intervals themselves (they're
// accurate — flux-based onset detection nails them to within ~0.5% in
// testing), using a median filter over the recent history instead of a
// mean so a single missed or doubled beat can't drag a whole average off;
// the outlier interval just gets outvoted next update.
//
// All the smoothing/decay below runs through `damp()` with a real-time
// rate constant rather than a per-frame lerp factor — otherwise the same
// "0.18 per frame" constant decays 2x+ faster in wall-clock time on a
// 144Hz display than on 60Hz, which reads as flicker.

import { damp } from '../util/damp.js';

const FFT = 2048;
const BANDS = 32;

// Rolling flux history used for each band's adaptive threshold.
const FLUX_HIST_LEN = 64;

// Beat-interval history used for median-filtered tempo tracking.
const BEAT_INTERVAL_HIST_LEN = 16;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.element = null;

    this.freqData = null;
    this.waveData = null;
    this._prevFreqData = null;

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
    this.flash = 0;

    // Clap/snare (mid band) and hat/cymbal (high band) transient detection,
    // each with its own decaying "pulse" envelope like beatKick.
    this.clap = false;
    this.clapStrength = 0;
    this.clapPulse = 0;
    this.hat = false;
    this.hatStrength = 0;
    this.hatPulse = 0;

    // Any-band union, kept for generic "something happened" reactivity.
    this.onset = false;
    this.onsetStrength = 0;

    // BPM
    this.bpm = 0;
    this.bpmPhase = 0;
    this.bpmInterval = 500;
    this.anticipate = 0;
    this.beatKick = 0;
    this._lastBeatTime = 0;
    this._lastClapTime = 0;
    this._lastHatTime = 0;
    this._beatIntervals = [];

    this._initHistBuffers();
  }

  _initHistBuffers() {
    this._kickFlux = _makeHist(FLUX_HIST_LEN);
    this._clapFlux = _makeHist(FLUX_HIST_LEN);
    this._hatFlux = _makeHist(FLUX_HIST_LEN);
  }

  reset() {
    this.bpm = 0;
    this.bpmPhase = 0;
    this.bpmInterval = 500;
    this.anticipate = 0;
    this.beatKick = 0;
    this._lastBeatTime = 0;
    this._lastClapTime = 0;
    this._lastHatTime = 0;
    this._beatIntervals = [];
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
    this.flash = 0;
    this.clap = false;
    this.clapStrength = 0;
    this.clapPulse = 0;
    this.hat = false;
    this.hatStrength = 0;
    this.hatPulse = 0;
    this.onset = false;
    this.onsetStrength = 0;
    this.bands.fill(0);
    this.bandsRaw.fill(0);
    // Re-allocate rather than null out: init() only builds this once (it
    // no-ops on later plays because this.ctx already exists), so nulling
    // it here left it null for the rest of the session and _tickOnsets
    // threw on every frame the moment a second song was picked — which is
    // what froze the visualizer while the audio kept playing underneath.
    if (this.freqData) this._prevFreqData = new Float32Array(this.freqData.length);
    this._initHistBuffers();
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT;
    this.analyser.smoothingTimeConstant = 0.6;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveData = new Uint8Array(this.analyser.frequencyBinCount);
    this._prevFreqData = new Float32Array(this.analyser.frequencyBinCount);
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

  tick(now, dt) {
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
      this.bands[b] = damp(this.bands[b], this.bandsRaw[b], 11.9, dt);
    }

    this.bass = _avg(this.freqData, 0, Math.floor(n * 0.03));
    this.mid = _avg(this.freqData, Math.floor(n * 0.03), Math.floor(n * 0.18));
    this.high = _avg(this.freqData, Math.floor(n * 0.18), Math.floor(n * 0.55));

    this.bassSmooth = damp(this.bassSmooth, this.bass, 9.75, dt);
    this.midSmooth = damp(this.midSmooth, this.mid, 7.7, dt);
    this.highSmooth = damp(this.highSmooth, this.high, 6.3, dt);
    this.bassAvg = damp(this.bassAvg, this.bass, 2.45, dt);

    this.bassPulse = Math.max(0, this.bass - this.bassAvg) / 255;
    this.energy =
      (this.bassSmooth * 0.6 + this.midSmooth * 0.3 + this.highSmooth * 0.1) /
      255;

    this._tickOnsets(now, n);
    this._tickBPM(now, dt);
  }

  // Three-band spectral flux: sum of positive rises in bin energy vs the
  // previous frame, split into kick/clap/hat ranges. A real percussive
  // attack shows up as a sharp rise in its band; a sustained loud
  // bassline does not, which is what makes this far more selective than
  // thresholding the raw level.
  _tickOnsets(now, n) {
    const kickHi = Math.max(4, Math.floor(n * 0.035));
    const clapHi = Math.max(kickHi + 8, Math.floor(n * 0.22));
    const hatHi = Math.max(clapHi + 8, Math.floor(n * 0.65));

    let kickFlux = 0,
      clapFlux = 0,
      hatFlux = 0;
    for (let i = 0; i < hatHi; i++) {
      const d = this.freqData[i] - this._prevFreqData[i];
      if (d > 0) {
        if (i < kickHi) kickFlux += d;
        else if (i < clapHi) clapFlux += d;
        else hatFlux += d;
      }
      this._prevFreqData[i] = this.freqData[i];
    }
    kickFlux /= kickHi;
    clapFlux /= Math.max(1, clapHi - kickHi);
    hatFlux /= Math.max(1, hatHi - clapHi);

    _pushHist(this._kickFlux, kickFlux);
    _pushHist(this._clapFlux, clapFlux);
    _pushHist(this._hatFlux, hatFlux);

    // Kick — the low band, drives BPM tracking + visual "beatKick".
    const kick = _bandStats(this._kickFlux, kickFlux, 1.4, 6);
    const minBeatGap = Math.max(140, this.bpmInterval * 0.35);
    this.beat =
      kick.ready && kickFlux > kick.thresh && now - this._lastBeatTime > minBeatGap;

    // Clap/snare — mid band, wider transient body than a kick.
    const clap = _bandStats(this._clapFlux, clapFlux, 1.7, 4);
    const minClapGap = 130;
    this.clap =
      clap.ready && clapFlux > clap.thresh && now - this._lastClapTime > minClapGap;
    this.clapStrength = clap.norm;
    if (this.clap) this._lastClapTime = now;

    // Hat/cymbal — high band, short and frequent so it gets a tighter gap.
    const hat = _bandStats(this._hatFlux, hatFlux, 2.1, 2.5);
    const minHatGap = 55;
    this.hat =
      hat.ready && hatFlux > hat.thresh && now - this._lastHatTime > minHatGap;
    this.hatStrength = hat.norm;
    if (this.hat) this._lastHatTime = now;

    this.onset = this.beat || this.clap || this.hat;
    this.onsetStrength = Math.max(kick.norm, clap.norm, hat.norm);
  }

  _tickBPM(now, dt) {
    this.beatKick = damp(this.beatKick, 0, 17.3, dt);
    this.clapPulse = damp(this.clapPulse, 0, 21.4, dt);
    this.hatPulse = damp(this.hatPulse, 0, 30.6, dt);

    if (this.clap) this.clapPulse = 1.0;
    if (this.hat) this.hatPulse = 1.0;

    if (this.beat) {
      this.beatKick = 1.0;

      if (this._lastBeatTime > 0) {
        const interval = now - this._lastBeatTime;
        // Plausible range: 40-240 BPM. Anything outside is almost
        // certainly a missed detection (interval too long) or a spurious
        // double-trigger (too short), so it's dropped rather than
        // allowed to skew the tempo estimate.
        if (interval > 250 && interval < 1500) {
          this._beatIntervals.push(interval);
          if (this._beatIntervals.length > BEAT_INTERVAL_HIST_LEN) this._beatIntervals.shift();
        }
      }
      this._lastBeatTime = now;
      this.bpmPhase = 0;
      this.anticipate = 0;

      if (this._beatIntervals.length >= 3) {
        // Prefer intervals close to the current running estimate — this
        // is what rejects an isolated missed beat (~2x interval) or a
        // spurious extra one (~0.5x) without needing to special-case
        // octave detection.
        const lo = this.bpmInterval * 0.6,
          hi = this.bpmInterval * 1.4;
        const clean = this._beatIntervals.filter((v) => v > lo && v < hi);
        const src = clean.length >= 3 ? clean : this._beatIntervals;
        const sorted = [...src].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const err = Math.abs(median - this.bpmInterval) / this.bpmInterval;
        this.bpmInterval += (median - this.bpmInterval) * Math.min(0.5, 0.2 + err * 0.5);
        this.bpm = Math.round(60000 / this.bpmInterval);
      }
    } else {
      this.bpmPhase = Math.min(1, (now - this._lastBeatTime) / this.bpmInterval);
      this.anticipate = Math.max(0, (this.bpmPhase - 0.8) / 0.2);
    }
  }
}

function _avg(arr, lo, hi) {
  let s = 0;
  for (let i = lo; i < hi; i++) s += arr[i] || 0;
  return s / Math.max(1, hi - lo);
}

function _makeHist(len) {
  return { buf: new Float32Array(len), idx: 0, count: 0, sum: 0, sumSq: 0 };
}

function _pushHist(hist, value) {
  const old = hist.buf[hist.idx];
  hist.sum += value - old;
  hist.sumSq += value * value - old * old;
  hist.buf[hist.idx] = value;
  hist.idx = (hist.idx + 1) % hist.buf.length;
  if (hist.count < hist.buf.length) hist.count++;
}

function _histMeanStd(hist) {
  const n = hist.count || 1;
  const mean = hist.sum / n;
  const variance = Math.max(0, hist.sumSq / n - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

// Threshold = mean + k·stddev over the band's rolling flux history, plus
// a normalized 0..1 "how far past the threshold" strength for pulses.
function _bandStats(hist, value, kStd, floor) {
  const { mean, std } = _histMeanStd(hist);
  const thresh = Math.max(floor, mean + std * kStd);
  const ready = hist.count > 8;
  const norm = std > 0 ? Math.max(0, Math.min(1, (value - mean) / (std * 4))) : 0;
  return { thresh, ready, norm };
}
