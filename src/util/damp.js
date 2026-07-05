// Frame-rate-independent exponential approach.
//
// Every smoothing/decay in this project used to be a per-frame lerp like
// `x += (target - x) * 0.18`, tuned by eye assuming ~60fps. On a 120/144Hz
// display those constants get applied 2-2.4x more often per real second,
// so bands, flashes, and particle motion all decay noticeably faster in
// wall-clock time than intended — and any frame-time jitter (the bloom
// pipeline alone does 5 blur passes) shows up directly as flicker/stutter
// since the decay speed is tied to how many frames landed, not how much
// time passed.
//
// `damp` fixes that: `rate` is a continuous decay constant (how fast
// `current` closes the gap to `target`, independent of dt), so the same
// `rate` produces the same real-time behavior at any frame rate.
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}
