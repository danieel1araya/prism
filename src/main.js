import { AudioEngine }        from './audio/AudioEngine.js';
import { Palette }            from './visual/Palette.js';
import { ThreeRenderer }      from './visual/ThreeRenderer.js';
import { Canvas2DVisualizer } from './visual/Canvas2DVisualizer.js';
import { UI }                 from './ui/UI.js';
import { MODES, MODES_2D }    from './shaders/index.js';
import { damp }               from './util/damp.js';

const bgCanvas   = document.getElementById('bgCanvas');
const bg2dCanvas = document.getElementById('bg2dCanvas');
const partCanvas = document.getElementById('particleCanvas');
const specCanvas = document.getElementById('specCanvas');

const audio    = new AudioEngine();
const palette  = new Palette();
const three    = new ThreeRenderer(bgCanvas);
const canvas2d = new Canvas2DVisualizer({ bg2dCanvas, particleCanvas: partCanvas, specCanvas });

let modeIndex   = 0;
let time        = 0;
let swirl       = 4;
let targetSwirl = 4;
let loopStarted = false;

const ui = new UI({ onSongSelect: playSong, onModeChange: switchMode });
ui.updateModeLabel(MODES, modeIndex);
applyModeVisibility();

function resize() {
  const W = innerWidth, H = innerHeight;
  [bgCanvas, bg2dCanvas, partCanvas].forEach(c => { c.width = W; c.height = H; });
  specCanvas.width = W; specCanvas.height = 200;
  three.resize();
}
window.addEventListener('resize', resize);
resize();

function switchMode(dir) {
  const was2D = MODES_2D.has(MODES[modeIndex]);
  modeIndex = (modeIndex + dir + MODES.length) % MODES.length;
  three.setMode(MODES[modeIndex], was2D);
  applyModeVisibility();
  canvas2d.clear2D();
  ui.updateModeLabel(MODES, modeIndex);
}

function applyModeVisibility() {
  const is2D = MODES_2D.has(MODES[modeIndex]);
  bgCanvas.style.display   = is2D ? 'none'  : 'block';
  bg2dCanvas.style.display = is2D ? 'block' : 'none';
}

async function playSong(song) {
  try {
    await audio.play(song.previewUrl);
  } catch(e) {
    ui.showToast('Could not load preview for this song.');
    return;
  }

  ui.showNowPlaying(song, img => palette.extractFromImage(img));

  if (!loopStarted) {
    three.init();
    loopStarted = true;
    requestAnimationFrame(loop);
  }
}

let lastNow = 0;
function loop(now) {
  requestAnimationFrame(loop);

  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow  = now;

  audio.tick(now, dt);
  palette.tick(dt);

  audio.flash  = Math.max(
    damp(audio.flash ?? 0, 0, 11.9, dt),
    audio.bassPulse * (audio.beat ? .9 : .4),
    audio.clapPulse * .5,
    audio.hatPulse * .22,
  );
  targetSwirl  = 3.5 + audio.energy * 8;
  swirl        = damp(swirl, targetSwirl, 3.1, dt);
  audio.swirl  = swirl;

  const mode = MODES[modeIndex];
  if (mode === 'SCOPE')       canvas2d.drawScope(audio, palette);
  else if (mode === 'RIPPLE') canvas2d.drawRipple(audio, palette, dt);
  else                        three.render(time, audio, palette, null, dt);

  time += (0.48 + audio.bassPulse * 4.8 + audio.energy * 0.9) * dt;

  canvas2d.drawSpectrum(audio, palette);
  canvas2d.updateParticles(audio, palette, MODES_2D.has(mode), dt);

  ui.updateHUD(audio);
}