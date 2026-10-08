"""Beat / bar / section analysis of a music track for the showreel edit.

    uv run --with librosa --with soundfile --with numpy python analyze.py in.wav out.json

Prints a per-bar table (energy, low end, brightness) so the edit can be cut to
the track's real structure, and writes the beat grid plus per-frame envelopes
the film reads to move with the music.
"""
import json
import sys

import librosa
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
FPS_ENV = 240  # envelope sample rate (the renderer's sub-frame rate)

y, sr = librosa.load(src, sr=22050, mono=True)
dur = len(y) / sr
hop = 256

onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, start_bpm=120, tightness=400)
beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
tempo = float(np.atleast_1d(tempo)[0])

# A constant-tempo grid fitted to the tracked beats: t = t0 + k * period
k = np.arange(len(beats))
period, t0 = np.polyfit(k, beats, 1)
resid = beats - (t0 + k * period)
bpm_fit = 60.0 / period
intervals = np.diff(beats)

# Band envelopes
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)) ** 2
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
times = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)


def band(lo, hi):
    return S[(freqs >= lo) & (freqs < hi)].sum(axis=0)


low = band(20, 150)
mid = band(150, 2000)
high = band(4000, 11000)
total = S.sum(axis=0)
centroid = librosa.feature.spectral_centroid(S=np.sqrt(S), sr=sr)[0]


def flux(e):
    d = np.diff(np.log1p(e * 1e-2), prepend=0)
    return np.maximum(d, 0)


low_flux = flux(low)
high_flux = flux(high)

# Extend the fitted grid over the whole track (also before the first tracked beat)
first_k = int(np.floor((0 - t0) / period))
last_k = int(np.ceil((dur - t0) / period))
grid = t0 + np.arange(first_k, last_k + 1) * period
grid = grid[(grid >= -1e-6) & (grid <= dur)]


def at(env, t, win=0.05):
    m = (times >= t - win) & (times <= t + win)
    return float(env[m].max()) if m.any() else 0.0


kick = np.array([at(low_flux, t) for t in grid])
snare = np.array([at(high_flux, t) for t in grid])

# Downbeat phase: harmonic change is strongest on bar lines. Fold chroma novelty by 4.
chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=sr, hop_length=hop)
ctimes = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=hop)


def chroma_between(a, b):
    m = (ctimes >= a) & (ctimes < b)
    return chroma[:, m].mean(axis=1) if m.any() else np.zeros(12)


novel = []
for i, t in enumerate(grid):
    a = chroma_between(t - period, t)
    b = chroma_between(t, t + period)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    novel.append(1 - float(a @ b / (na * nb)) if na > 0 and nb > 0 else 0.0)
novel = np.array(novel)
phase_scores = {}
for p in range(4):
    idx = np.arange(p, len(grid), 4)
    phase_scores[p] = {
        'harmonic': float(novel[idx].mean()),
        'kick': float(kick[idx].mean()),
        'snare': float(snare[idx].mean()),
    }
# snare/clap sits on beats 2 and 4, so the downbeat phase has LOW snare and its +1 has HIGH
best = max(range(4), key=lambda p: phase_scores[p]['harmonic'])
downbeat_idx = best

# Per-bar table
bars = []
start = downbeat_idx
# include a pickup bar if the first downbeat is not at index 0
bar_starts = list(range(start, len(grid), 4))
rms_db = 10 * np.log10(total + 1e-9)
ref = np.percentile(rms_db, 95)
for n, bi in enumerate(bar_starts):
    a = grid[bi]
    b = grid[bi + 4] if bi + 4 < len(grid) else dur
    m = (times >= a) & (times < b)
    if not m.any():
        continue
    bars.append({
        'bar': n + 1,
        't': round(float(a), 3),
        'level_db': round(float(10 * np.log10(total[m].mean() + 1e-9) - ref), 1),
        'low_db': round(float(10 * np.log10(low[m].mean() + 1e-9) - 10 * np.log10(np.percentile(low, 95) + 1e-9)), 1),
        'high_db': round(float(10 * np.log10(high[m].mean() + 1e-9) - 10 * np.log10(np.percentile(high, 95) + 1e-9)), 1),
        'kick': round(float(low_flux[m].mean() / (low_flux.mean() + 1e-9)), 2),
        'hats': round(float(high_flux[m].mean() / (high_flux.mean() + 1e-9)), 2),
        'centroid': int(centroid[m].mean()),
    })

# Where the track actually ends
tail = np.where(rms_db > ref - 45)[0]
end_audible = float(times[tail[-1]]) if len(tail) else dur
last2 = (times >= dur - 2.0)
tail_level = float(10 * np.log10(total[last2].mean() + 1e-9) - ref)

# Envelopes for the film, resampled to FPS_ENV
tt = np.arange(0, dur, 1.0 / FPS_ENV)


def norm_env(e, smooth=3):
    e = np.sqrt(e)
    e = e / (np.percentile(e, 99) + 1e-9)
    if smooth > 1:
        e = np.convolve(e, np.ones(smooth) / smooth, mode='same')
    return np.clip(np.interp(tt, times, e), 0, 1.5)


out = {
    'file': src,
    'duration': round(dur, 3),
    'tempo_tracked': round(tempo, 3),
    'bpm_fit': round(float(bpm_fit), 4),
    'period': float(period),
    't0': float(t0),
    'grid_first_beat': float(grid[0]),
    'beat_resid_ms': {'rms': round(float(np.sqrt((resid ** 2).mean()) * 1000), 1), 'max': round(float(np.abs(resid).max() * 1000), 1)},
    'interval_ms': {'median': round(float(np.median(intervals) * 1000), 2), 'std': round(float(intervals.std() * 1000), 2)},
    'n_beats_tracked': int(len(beats)),
    'phase_scores': phase_scores,
    'downbeat_index': int(downbeat_idx),
    'first_downbeat': float(grid[downbeat_idx]),
    'end_audible': round(end_audible, 3),
    'tail_level_db': round(tail_level, 1),
    'bars': bars,
    'grid': [round(float(t), 4) for t in grid],
    'beats_tracked': [round(float(t), 4) for t in beats],
    'env_fps': FPS_ENV,
    'env_level': [round(float(v), 3) for v in norm_env(total, 9)],
    'env_low': [round(float(v), 3) for v in norm_env(low, 5)],
    'env_high': [round(float(v), 3) for v in norm_env(high, 5)],
    'env_kick': [round(float(v), 3) for v in np.clip(np.interp(tt, times, low_flux / (np.percentile(low_flux, 99.5) + 1e-9)), 0, 1.5)],
}
with open(dst, 'w') as f:
    json.dump(out, f)

print(f"== {src}")
print(f"duration {dur:.2f}s  tracked tempo {tempo:.2f}  fitted {bpm_fit:.3f} BPM  period {period * 1000:.2f} ms  t0 {t0:.3f}s")
print(f"beat residual vs constant grid: rms {out['beat_resid_ms']['rms']} ms, max {out['beat_resid_ms']['max']} ms   interval std {out['interval_ms']['std']} ms   beats {len(beats)}")
print('phase scores (harmonic change / kick / snare):', {p: {k2: round(v, 3) for k2, v in s.items()} for p, s in phase_scores.items()})
print(f"downbeat phase {downbeat_idx}  first downbeat at {grid[downbeat_idx]:.3f}s   audible end {end_audible:.2f}s  tail level {tail_level:.1f} dB")
print('bar   t     level   low   high  kick  hats  centroid')
for b in bars:
    bar_len = 28
    lvl = max(0, min(bar_len, int((b['level_db'] + 30) / 30 * bar_len)))
    print(f"{b['bar']:>3} {b['t']:>6.2f} {b['level_db']:>6.1f} {b['low_db']:>6.1f} {b['high_db']:>6.1f} {b['kick']:>5.2f} {b['hats']:>5.2f} {b['centroid']:>6}  {'#' * lvl}")
