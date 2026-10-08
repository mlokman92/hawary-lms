"""Estimate the key of the soundtrack so tuned sound effects sit inside it.

    uv run --with librosa --with soundfile --with numpy python key.py music.wav
"""
import sys

import librosa
import numpy as np

y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
yh = librosa.effects.harmonic(y)
chroma = librosa.feature.chroma_cqt(y=yh, sr=sr).mean(axis=1)
major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
scores = []
for i in range(12):
    scores.append((float(np.corrcoef(np.roll(major, i), chroma)[0, 1]), names[i] + ' major'))
    scores.append((float(np.corrcoef(np.roll(minor, i), chroma)[0, 1]), names[i] + ' minor'))
scores.sort(reverse=True)
print('chroma', {n: round(float(c), 3) for n, c in zip(names, chroma / chroma.max())})
for s, k in scores[:5]:
    print(f'{k:10s} {s:.3f}')
tuning = librosa.estimate_tuning(y=yh, sr=sr)
print('tuning offset (fraction of a semitone):', round(float(tuning), 3))
