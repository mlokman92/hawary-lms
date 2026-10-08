import data from './music.json'

// The soundtrack is a constant 120 BPM in 4/4 (fitted 119.985, beat error
// 3.7 ms rms), so the whole edit is written in bars and beats and converted
// here. tools/audio/analyze.py produced music.json from the track.

/** Seconds per beat. */
export const BEAT: number = data.period
/** Seconds per bar. */
export const BAR = BEAT * 4
/** Time of the first downbeat (bar 1, beat 1). */
export const T0: number = data.first_downbeat

/** Absolute time of a bar line. Bars are 1-based; `b` is beats into the bar (0-3.99). */
export const bar = (n: number, b = 0) => T0 + ((n - 1) * 4 + b) * BEAT
/** A length of n beats, in seconds. */
export const beats = (n: number) => n * BEAT
/** A length of n bars, in seconds. */
export const bars = (n: number) => n * BAR

const FPS = data.env_fps as number
function sample(env: number[], t: number): number {
  const i = t * FPS
  const a = Math.max(0, Math.min(env.length - 1, Math.floor(i)))
  const b = Math.min(env.length - 1, a + 1)
  const f = i - Math.floor(i)
  return env[a] * (1 - f) + env[b] * f
}

/** The track, readable at any absolute time. All envelopes are roughly 0-1. */
export const music = {
  duration: data.duration as number,
  /** Overall loudness. */
  level: (t: number) => sample(data.env_level, t),
  /** Low end (kick and bass body). */
  low: (t: number) => sample(data.env_low, t),
  /** Hats, shimmer, air. */
  high: (t: number) => sample(data.env_high, t),
  /** Kick transients: spikes on each kick, near 0 between. */
  kick: (t: number) => sample(data.env_kick, t),
  /** 0-1 position inside the current beat. */
  beatPhase: (t: number) => (((t - T0) / BEAT) % 1 + 1) % 1,
  /** 0-1 position inside the current bar. */
  barPhase: (t: number) => (((t - T0) / BAR) % 1 + 1) % 1,
  /** A decaying pulse that restarts on every beat: 1 on the beat, falling to 0. `sharp` shapes the fall. */
  pulse: (t: number, sharp = 3) => Math.pow(1 - ((((t - T0) / BEAT) % 1 + 1) % 1), sharp),
}
