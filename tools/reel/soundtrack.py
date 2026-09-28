"""Original soundtracks for the DevShop Retail OS reel, in two styles.

funk: synthesised here, so there is nothing to license.

120 BPM disco-funk in D (Dmaj7 Bm7 Em7 A7), built around a 16th-note slap bass: ghost notes,
octave pops, slides and chromatic approach notes, with a scale run up into the 2x drop.
Syncopated drums with ghost snares, guitar chanks, clavinet and horn stabs. Every hit is
timed to the reel's animation (devshop-retail-os.html); 4.5 s and 22.5 s are downbeats.
piano: bright, bouncy solo piano at the same tempo, played on recorded grand-piano samples
(FluidR3 GM via github.com/gleitz/midi-js-soundfonts, CC BY 3.0: credit "Piano samples: FluidR3 GM").
Left hand walks D-C#-B-G, right hand plays offbeat chords and a hook; hits land on the animation.
Usage: python3 tools/reel/soundtrack.py funk|piano out.wav [piano-sample-dir]
"""
import os, subprocess
import sys
from functools import lru_cache
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR = 44100, 44.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
tt = lambda d: np.arange(int(d * SR)) / SR

def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)

# ---------------------------------------------------------------- instruments
def ks(f, d, damp=0.5, decay=0.997, seed=0):
    """Karplus-Strong plucked string, block-vectorised."""
    P = max(2, int(round(SR / f))); n = int(d * SR)
    r = np.random.default_rng(seed)
    y = np.zeros(n + P)
    burst = r.uniform(-1, 1, P)
    burst = damp * burst + (1 - damp) * np.convolve(burst, np.ones(4) / 4, 'same')
    y[:P] = burst
    for b in range(1, (n + P) // P + 1):
        s, e = b * P, min((b + 1) * P, n + P)
        if s >= n + P: break
        prev = y[s - P:e - P]; prev2 = y[s - P - 1:e - P - 1] if s - P - 1 >= 0 else np.concatenate([[0], y[s - P:e - P - 1]])
        y[s:e] = decay * 0.5 * (prev + prev2)
    out = y[:n]
    fade = int(0.01 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    return out

@lru_cache(None)
def guitar(m, d=0.6, muted=False, v=0):
    x = ks(hz(m), d, damp=0.35 if muted else 0.6, decay=0.93 if muted else 0.996, seed=v)
    return filt(x, 'lowpass', 2500 if muted else 4500) * (1.4 if muted else 1)

@lru_cache(None)
def uke(m, d=0.9, v=0):
    return filt(ks(hz(m), d, damp=0.7, decay=0.994, seed=v), 'bandpass', [180, 5000])

@lru_cache(None)
def epiano(m, d=1.2):
    t = tt(d); f = hz(m)
    idx = 1.6 * np.exp(-t * 7)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    x += 0.12 * np.sin(2 * np.pi * 14 * f * t) * np.exp(-t * 45)          # tine
    return x * np.exp(-t * 2.6) * (1 + 0.12 * np.sin(2 * np.pi * 5 * t)) * np.minimum(1, t * 400)

@lru_cache(None)
def steelpan(m, d=1.0):
    t = tt(d); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.55 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3) \
        + 0.28 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 6) + 0.1 * np.sin(2 * np.pi * 4.2 * f * t) * np.exp(-t * 12)
    return x * np.exp(-t * 3.2) * np.minimum(1, t * 250)

@lru_cache(None)
def glock(m, d=1.4):
    t = tt(d); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 8) + 0.15 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 16)
    return x * np.exp(-t * 3.5) * np.minimum(1, t * 800)

@lru_cache(None)
def pluck(m, d=0.35):
    t = tt(d); f = hz(m)
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    return (0.6 * np.sin(2 * np.pi * f * t) + 0.4 * tri) * np.exp(-t * 13) * np.minimum(1, t * 600)

def saw(f, t, voices=3, det=0.01):
    out = 0
    for v in range(voices):
        fv = f * (1 + det * (v - (voices - 1) / 2))
        out = out + sum(np.sin(2 * np.pi * k * fv * t + 1.7 * v) / k for k in range(1, 14) if k * fv < 10000)
    return out / voices

def strings(chord, d, cutoff=2200):
    t = tt(d); x = sum(saw(hz(m), t, 4, 0.014) for m in chord)
    env = np.minimum(1, t / 0.35) * np.minimum(1, np.maximum(0, d - t) / 0.4)
    return filt(x, 'lowpass', cutoff) * env * 0.1

@lru_cache(None)
def synth_bass(m, d=0.22, bright=1400):
    t = tt(d); f = hz(m)
    x = saw(f, t, 1)
    return filt(x, 'lowpass', bright) * np.exp(-t * 7) * np.minimum(1, t * 300)

@lru_cache(None)
def round_bass(m, d=0.4):
    t = tt(d); f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 4) * np.minimum(1, t * 300)

@lru_cache(None)
def kick(hard=1.0):
    t = tt(0.35); f = 48 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8) + hard * 0.25 * filt(rng.standard_normal(len(t)), 'bandpass', [1500, 5000]) * np.exp(-t * 250)

@lru_cache(None)
def stomp():
    t = tt(0.3)
    return np.sin(2 * np.pi * np.cumsum(60 + 50 * np.exp(-t * 25)) / SR) * np.exp(-t * 11) + 0.35 * filt(rng.standard_normal(len(t)), 'lowpass', 900) * np.exp(-t * 25)

@lru_cache(None)
def clap(v=0):
    r = np.random.default_rng(v); t = tt(0.28)
    n = filt(r.standard_normal(len(t)), 'bandpass', [1000, 3000])
    env = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) * 70) for d in (0, .009, .019)) * 0.5 + (t >= .028) * np.exp(-np.clip(t - .028, 0, None) * 16)
    return n * env

@lru_cache(None)
def snap():
    t = tt(0.12)
    return filt(rng.standard_normal(len(t)), 'bandpass', [1800, 6000]) * np.exp(-t * 45)

@lru_cache(None)
def snare():
    t = tt(0.25)
    return 0.6 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) + filt(rng.standard_normal(len(t)), 'bandpass', [1200, 8000]) * np.exp(-t * 16)

@lru_cache(None)
def hat(open_=False, v=0):
    r = np.random.default_rng(100 + v); t = tt(0.3 if open_ else 0.05)
    return filt(r.standard_normal(len(t)), 'highpass', 7500) * np.exp(-t * (10 if open_ else 75))

@lru_cache(None)
def shaker(v=0):
    r = np.random.default_rng(200 + v); t = tt(0.09)
    return filt(r.standard_normal(len(t)), 'bandpass', [4500, 12000]) * np.minimum(1, t / 0.012) * np.exp(-t * 38)

@lru_cache(None)
def crash():
    t = tt(2.2)
    return filt(rng.standard_normal(len(t)), 'highpass', 4000) * np.exp(-t * 2.4) + 0.3 * filt(rng.standard_normal(len(t)), 'bandpass', [2000, 4000]) * np.exp(-t * 5)

def riser(d, lo=300, hi=7000):
    t = tt(d); n = rng.standard_normal(len(t)); out = np.zeros_like(n); seg = int(SR * 0.04)
    for s in range(0, len(n), seg):
        fc = lo * (hi / lo) ** (s / len(n))
        out[s:s + seg] = filt(n[s:s + seg], 'bandpass', [fc * 0.7, min(fc * 1.4, 20000)], 1)
    return out * (t / d) ** 2 * 0.5

# ---------------------------------------------------------------- funk parts
def fbass(m, d, glide=None, kind='finger'):
    """Additive plucked bass: upper harmonics die first, optional slide from `glide`."""
    t = tt(d + 0.03); f = np.full(len(t), hz(m))
    if glide is not None:
        g = min(len(t), int(0.07 * SR)); f[:g] = hz(glide) * (hz(m) / hz(glide)) ** (np.arange(g) / g)
    ph = 2 * np.pi * np.cumsum(f) / SR
    bright = {'finger': 0.7, 'slap': 0.45, 'pop': 0.38, 'ghost': 2.5}[kind]
    x = sum(np.sin(k * ph) * np.exp(-t * (2.5 + 9 * bright * k ** 0.8)) / k ** (0.85 if kind != 'pop' else 0.6) * (0.6 if k == 1 else 1)
            for k in range(1, 16) if k * hz(m) < 12000)
    if kind in ('slap', 'pop'):
        x = x + filt(rng.standard_normal(len(t)), 'highpass', 2500) * np.exp(-t * 400) * (0.5 if kind == 'slap' else 0.8)
    if kind == 'ghost':
        x = 0.5 * x * np.exp(-t * 60) + 0.3 * filt(rng.standard_normal(len(t)), 'bandpass', [150, 900]) * np.exp(-t * 90)
    env = np.minimum(1, t / 0.003) * np.clip((d + 0.03 - t) / 0.03, 0, 1)
    return x * env

def clav(m, d=0.18, v=0):
    x = ks(hz(m), d, damp=0.9, decay=0.985, seed=v)
    return filt(x, 'bandpass', [400, 5500]) * 1.6

def horns(chord, d=0.22, fall=False):
    t = tt(d); out = 0
    for m in chord:
        f = np.full(len(t), hz(m))
        if fall: f *= 2 ** (-np.clip(t - d * 0.45, 0, None) * 5 / 12)
        ph = 2 * np.pi * np.cumsum(f) / SR
        out = out + sum(np.sin(k * ph + v) / k for k in range(1, 12) for v in (0, 0.02 * k))
    cut = 900 + 3500 * np.minimum(1, t / 0.03) * np.exp(-t * 6)             # brassy filter swell
    y = np.zeros_like(out); seg = int(0.01 * SR)
    for s in range(0, len(out), seg):
        y[s:s + seg] = filt(out[s:s + seg + 0], 'lowpass', float(cut[s]), 1)
    env = np.minimum(1, t / 0.015) * np.clip((d - t) / 0.05, 0, 1)
    return y * env * 0.12

CHORDS = [dict(v=[62, 66, 69, 73], r=38, third=4, sev=11),   # Dmaj7
          dict(v=[59, 62, 66, 69], r=35, third=3, sev=10),   # Bm7
          dict(v=[59, 62, 64, 67], r=40, third=3, sev=10),   # Em7
          dict(v=[61, 64, 67, 69], r=33, third=4, sev=10)]   # A7

# bass patterns: step -> (interval from root, length in 16ths, kind); 'app' = chromatic approach to next root
BASS_A = {0: (0, 2, 'slap'), 2: (0, 1, 'ghost'), 3: (12, 1, 'pop'), 4: (0, 1, 'finger'), 6: (7, 1, 'finger'),
          7: (0, 1, 'ghost'), 8: ('sev', 1, 'finger'), 9: (12, 1, 'pop'), 10: (0, 2, 'slap'), 12: (12, 1, 'pop'),
          13: (0, 1, 'ghost'), 14: (7, 1, 'finger'), 15: ('app', 1, 'finger')}
BASS_B = {0: (0, 3, 'slap'), 3: (12, 1, 'pop'), 5: (0, 1, 'ghost'), 6: ('third', 1, 'finger'), 7: (5, 1, 'finger'),
          8: (7, 2, 'slide'), 10: (12, 1, 'pop'), 11: ('sev', 1, 'finger'), 12: (7, 1, 'finger'), 13: (0, 1, 'ghost'),
          14: (5, 1, 'finger'), 15: ('app', 1, 'finger')}
KICK = {0, 6, 10}; KICK_B = {0, 3, 8, 10}
CLAV = {1: 3, 5: 2, 9: 3, 11: 2, 13: 1}            # step -> chord tone (clavinet answers the bass)

def build_funk():
    bpm = 120; beat = 60 / bpm; bar = 4 * beat; step = beat / 4; swing = 0.07
    anchor, drop = 4.5, 22.5; brk = drop - bar; end = 37.5
    dry = np.zeros((N, 2)); wet = np.zeros((N, 2))

    def add(sig, t, gain=1.0, pan=0.0, send=0.0, human=True):
        if human: t += rng.normal(0, 0.003); gain *= 1 + rng.normal(0, 0.07)
        i = int(max(0, t) * SR)
        if i >= N: return
        sig = sig[: N - i] * gain
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        dry[i:i + len(sig), 0] += sig * l; dry[i:i + len(sig), 1] += sig * r
        if send: wet[i:i + len(sig), 0] += sig * l * send; wet[i:i + len(sig), 1] += sig * r * send

    first = anchor - 2 * bar
    for bi in range(int((end - first) / bar) + 1):
        t0 = first + bi * bar
        if t0 >= end: break
        k = int(round((t0 - anchor) / bar)); ch = CHORDS[k % 4]; nxt = CHORDS[(k + 1) % 4]
        intro, building = t0 < anchor, brk <= t0 < drop
        full = not intro and not building
        pat = BASS_B if k % 2 else BASS_A
        prev_note = ch['r']
        for s in range(16):
            t = t0 + s * step + (swing * step if s % 2 else 0)
            if t < 0 or t >= end: continue
            # bass: half the pattern in the second intro bar, full in the groove
            if (full or (intro and t0 >= anchor - bar and s in (0, 3, 6, 10, 12, 14))) and s in pat:
                iv, ln, kind = pat[s]
                if iv == 'app':
                    target = nxt['r']; iv = target - ch['r'] + (1 if s % 2 else -1)
                elif iv in ('third', 'sev'):
                    iv = ch[iv]
                note = ch['r'] + iv
                glide = prev_note if kind == 'slide' else None
                add(fbass(note, ln * step * 0.92, glide, 'finger' if kind == 'slide' else kind), t,
                    {'slap': 0.6, 'pop': 0.45, 'finger': 0.48, 'ghost': 0.35}.get(kind, 0.48))
                if kind != 'ghost': prev_note = note
            if full:
                kicks = KICK_B if k % 2 else KICK
                if s in kicks: add(kick(), t, 0.5, human=False)
                if s in (4, 12): add(snare(), t, 0.7, send=0.25); add(clap(s), t, 0.3, send=0.3)
                if s in (7, 9, 15): add(snare(), t, 0.1)                        # ghost snares
                if s == 14 and k % 2: add(hat(True, s), t, 0.24, pan=0.5)
                else: add(hat(False, s), t, 0.2 if s % 2 == 0 else 0.11, pan=0.5)
                # guitar: chank on the offbeats, muted scratch between
                if s in (2, 6, 10, 14):
                    for j, m in enumerate(ch['v'][1:]): add(guitar(m + 12, 0.18, False, s % 3), t + j * 0.005, 0.42, pan=-0.7, send=0.15)
                elif s % 2:
                    add(guitar(ch['v'][2] + 12, 0.07, True, s % 3), t, 0.2, pan=-0.7)
                if s in CLAV and bi % 2 == 0: add(clav(ch['v'][CLAV[s]] + 12, 0.14, s % 3), t, 0.34, pan=0.7, send=0.15)
                if s == 14 and k % 4 == 3: add(horns([m + 12 for m in nxt['v'][1:]], 0.16), t, 0.9, send=0.3)
            elif intro:
                if s % 2 == 0: add(hat(False, s), t, 0.15, pan=0.5)
                if s in (2, 6, 10, 14):
                    for j, m in enumerate(ch['v'][1:]): add(guitar(m + 12, 0.14, False, s % 3), t + j * 0.005, 0.32, pan=-0.7, send=0.2)
            if intro and s in (4, 12): add(clap(s), t, 0.35, send=0.35)

    # build bar: drums stop, the bass runs up the D major scale into the drop, a snare roll swells
    run = [33, 35, 37, 38, 40, 42, 43, 45, 47, 49, 50, 52, 54, 55, 57, 59]
    for i, m in enumerate(run): add(fbass(m, step * 0.9, None, 'pop' if i >= 12 else 'finger'), brk + i * step, 0.4 + 0.015 * i)
    for i in range(16): add(snare(), brk + i * step, 0.04 + 0.018 * i, send=0.2)
    add(riser(bar, 250, 8000), brk, 0.35)

    # hits timed to the animation
    scale = [74, 76, 78, 79, 81, 83, 86, 88, 90, 91]
    add(riser(0.6, 800, 6000), 0.0, 0.15)
    for s in (10.2, 26.2, 31.2): add(riser(0.7), s - 0.7, 0.18)
    for i in range(7): add(clav(scale[i], 0.3, i % 3), 6.0 + i * 0.5, 0.26, pan=0.2, send=0.3)          # tracker ticks
    for i, s in enumerate((11.6, 12.8, 14.0, 15.2, 16.4, 17.6)): add(epiano(scale[3 + i], 0.9), s, 0.14, pan=-0.2, send=0.35)
    add(crash(), drop, 0.32, send=0.2); add(kick(), drop, 0.9, human=False)                           # 2x lands
    add(fbass(38, 0.5, None, 'slap'), drop, 0.7); add(horns([66, 69, 73, 74], 0.45, fall=True), drop, 1.0, send=0.4)
    add(horns([74, 78, 81], 0.1), 28.9, 0.9, send=0.3); add(horns([76, 79, 83], 0.3), 29.05, 0.9, send=0.4)  # Monday
    for i, s in enumerate((32.3, 32.6, 32.9, 33.2, 33.5)): add(clav(scale[2 + i], 0.25, i % 3), s, 0.22, pan=0.3, send=0.3)
    add(riser(1.0), end - 1.0, 0.25)
    add(crash(), end, 0.3, send=0.3); add(kick(), end, 0.8, human=False)                              # end card
    add(fbass(38, 1.8, 45, 'finger'), end, 0.6); add(horns([62, 66, 69, 73, 76], 1.3), end, 1.0, send=0.6)
    for m in [62, 66, 69, 73]: add(epiano(m, 3.5), end, 0.1, send=0.5)
    for d, m in ((0, 74), (0.16, 78), (0.32, 81), (0.48, 86)): add(epiano(m, 2.0), 39.6 + d, 0.15, send=0.55)  # "Let's talk."

    # mix: reverb send, gentle glue, fade
    ir_t = tt(1.4); ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t * 4)[:, None]
    ir = np.stack([filt(ir[:, c], 'lowpass', 7000) for c in range(2)], 1)
    rev = np.stack([fftconvolve(wet[:, c], ir[:, c])[:N] for c in range(2)], 1)
    mix = dry + rev * (0.28 / (np.abs(rev).max() + 1e-9) * np.abs(dry).max())
    mix = filt(mix.T, 'highpass', 32).T
    fade = np.ones(N); f0 = int(41.8 * SR); fade[f0:] = np.cos(np.linspace(0, np.pi / 2, N - f0)) ** 2
    mix *= fade[:, None]
    mix = mix / np.sqrt(np.mean(mix ** 2)) * 0.16
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    return mix / np.abs(mix).max() * 0.89

# ---------------------------------------------------------------- piano
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

def load_piano(folder):
    import imageio_ffmpeg
    ff = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
    bank = {}
    for m in range(28, 101):
        path = os.path.join(folder, f"{NAMES[m % 12]}{m // 12 - 1}.mp3")
        raw = subprocess.run([ff, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)
        on = np.argmax(np.abs(x).max(1) > 0.01)                # trim encoder padding
        bank[m] = x[max(0, on - 40):]
    return bank

def build_piano(folder):
    bank = load_piano(folder)
    bpm = 120; beat = 60 / bpm; bar = 4 * beat; step = beat / 4; swing = 0.1
    anchor, drop = 4.5, 22.5; brk = drop - bar; end = 37.5
    out = np.zeros((N, 2))
    hits = []

    def note(m, t, vel=0.7, length=0.5, human=True):
        if human: t += rng.normal(0, 0.005); vel *= 1 + rng.normal(0, 0.06)
        i = int(max(0, t) * SR)
        if i >= N: return
        m = int(m)
        while m > 100: m -= 12
        while m < 28: m += 12
        x = bank[m].copy()
        n = min(len(x), int((length + 0.25) * SR))            # damper: release over 0.25 s after the key lifts
        x = x[:n]
        rel = int(length * SR)
        if rel < n: x[rel:] *= np.linspace(1, 0, n - rel)[:, None] ** 2
        if vel < 0.6: x = np.stack([filt(x[:, c], 'lowpass', 2500 + 6000 * vel) for c in range(2)], 1)
        x = x[: N - i]
        out[i:i + len(x)] += x * vel

    q = lambda t: anchor + round((t - anchor) / step) * step    # snap hits to the 16th grid
    # hits timed to the animation (collected first so the melody can make room)
    scale = [74, 76, 78, 79, 81, 83, 86, 88, 90, 91]
    for i in range(7): hits.append((q(6.0 + i * 0.5), [scale[i] + 12], 0.55, 0.4))              # tracker ticks
    for i, s in enumerate((11.6, 12.8, 14.0, 15.2, 16.4, 17.6)): hits.append((q(s), [scale[3 + i] + 12, scale[3 + i]], 0.5, 0.6))
    hits.append((q(28.9), [86 + 12], 0.6, 0.3)); hits.append((q(28.9) + step, [93], 0.6, 0.8))  # Monday ding-ding
    for i, s in enumerate((32.3, 32.6, 32.9, 33.2, 33.5)): hits.append((q(s), [scale[2 + i] + 12], 0.5, 0.35))
    busy = lambda t: any(abs(t - h[0]) < 0.3 for h in hits)

    # D  A/C#  Bm  G : LH root, RH chord, melody per step (step: (midi, length in 16ths))
    CH = [dict(lh=38, rh=[66, 69, 74], mel={0: (81, 2), 3: (78, 2), 6: (81, 2), 8: (83, 2), 10: (81, 2), 12: (78, 4)}),
          dict(lh=37, rh=[64, 69, 73], mel={0: (76, 2), 3: (73, 2), 6: (76, 2), 8: (78, 2), 10: (76, 2), 12: (73, 4)}),
          dict(lh=35, rh=[66, 71, 74], mel={0: (74, 2), 3: (78, 2), 6: (81, 2), 8: (83, 2), 10: (86, 2), 12: (83, 4)}),
          dict(lh=31, rh=[67, 71, 74], mel={0: (83, 2), 3: (81, 2), 6: (79, 2), 8: (78, 2), 10: (76, 2), 12: (74, 2), 14: (76, 2)})]
    first = anchor - 2 * bar
    for bi in range(int((end - first) / bar) + 1):
        t0 = first + bi * bar
        if t0 >= end: break
        k = int(round((t0 - anchor) / bar)); c = CH[k % 4]
        intro, building = t0 < anchor, brk <= t0 < drop
        melody_on = intro or t0 >= drop
        lift = 12 if t0 >= 30.5 else 0                              # last bars: hook up an octave
        for s in range(16):
            t = t0 + s * step + (swing * step if s % 2 else 0)
            if t < 0 or t >= end or building: continue
            # left hand: octave on 1, bounce on the and-of-2, fifth on 3, pickup on the a-of-4
            if not (intro and t0 < anchor - bar):
                if s == 0: note(c['lh'], t, 0.62, bar * 0.45); note(c['lh'] + 12, t, 0.5, bar * 0.45)
                if s == 6: note(c['lh'] + 12, t, 0.42, step * 1.5)
                if s == 8: note(c['lh'] + 7, t, 0.5, bar * 0.3)
                if s == 14: note(c['lh'] + 12, t, 0.4, step * 1.5)
            # right hand: offbeat chords, a little push on the a-of-3
            if s in (2, 6, 10, 11, 14) and not intro:
                for j, m in enumerate(c['rh']): note(m, t + j * 0.004, 0.36 if s != 11 else 0.26, step * (1.6 if s != 11 else 0.8))
            if melody_on and s in c['mel'] and not busy(t):
                m, ln = c['mel'][s]; note(m + lift, t, 0.62 if s in (0, 8) else 0.5, ln * step)
    # build: right hand climbs D major in 16ths into the drop, left hand holds A
    note(33, brk, 0.55, bar); note(45, brk, 0.45, bar)
    climb = [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86, 88]
    for i, m in enumerate(climb): note(m, brk + i * step, 0.35 + 0.025 * i, step * 1.2)
    for m in (38, 50, 62, 66, 69, 74, 78): note(m, drop, 0.72, bar * 0.9)                  # the 2x lands
    for t, ms, v, ln in hits:
        for m in ms: note(m, t, v, ln)
    for j, m in enumerate((38, 50, 57, 62, 66, 69, 74, 78, 81)): note(m, end + j * 0.045, 0.6, 5.5)   # end card: rolled D
    for d, m in ((0, 86), (0.16, 90), (0.32, 93), (0.48, 98)): note(m, 39.6 + d, 0.42, 2.5)    # "Let's talk."

    ir_t = tt(1.8); ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t * 3.2)[:, None]
    ir = np.stack([filt(ir[:, c], 'lowpass', 6000) for c in range(2)], 1)
    rev = np.stack([fftconvolve(out[:, c], ir[:, c])[:N] for c in range(2)], 1)
    mix = out + rev * (0.22 / (np.abs(rev).max() + 1e-9) * np.abs(out).max())
    mix = filt(mix.T, 'highpass', 35).T
    fade = np.ones(N); f0 = int(42.0 * SR); fade[f0:] = np.cos(np.linspace(0, np.pi / 2, N - f0)) ** 2
    mix *= fade[:, None]
    mix = mix / np.sqrt(np.mean(mix ** 2)) * 0.14
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    return mix / np.abs(mix).max() * 0.89

if __name__ == '__main__':
    style, out = sys.argv[1], sys.argv[2]
    mix = build_funk() if style == 'funk' else build_piano(sys.argv[3] if len(sys.argv) > 3 else 'piano-samples')
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print(style, 'written', out)
