"""Original soundtrack for the DevShop Retail OS reel. Synthesised here, so no licensing.

Bright, bouncy house at 120 BPM in D major (D-A-Bm-G), with hits timed to the
reel's animation (tools/reel/devshop-retail-os.html). Writes a 44 s stereo WAV.
Usage: python3 tools/reel/soundtrack.py out.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR, BPM = 44100, 44.0, 120
BEAT = 60 / BPM                      # 0.5 s
T0 = 0.5                             # first downbeat, so 4.5 s and 22.5 s land on downbeats
N = int(SR * DUR)
rng = np.random.default_rng(7)

dry = np.zeros((N, 2)); wet = np.zeros((N, 2))
kick_env = np.zeros(N)

hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)
def add(sig, t, gain=1.0, pan=0.0, send=0.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    dry[i:i + len(sig), 0] += sig * l; dry[i:i + len(sig), 1] += sig * r
    if send:
        wet[i:i + len(sig), 0] += sig * l * send; wet[i:i + len(sig), 1] += sig * r * send
def tt(d): return np.arange(int(d * SR)) / SR

# ---- instruments
def kick():
    t = tt(0.32); f = 45 + 95 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) + 0.3 * np.exp(-t * 300) * rng.standard_normal(len(t)) * 0.2
def clap():
    t = tt(0.25); n = filt(rng.standard_normal(len(t)), 'bandpass', [900, 2600])
    env = sum(np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d) for d in (0, .011, .022)) * 0.5 + np.exp(-t * 18) * 0.5
    return n * env
def hat(open_=False):
    t = tt(0.22 if open_ else 0.05)
    return filt(rng.standard_normal(len(t)), 'highpass', 7000) * np.exp(-t * (14 if open_ else 70))
def marimba(m, d=0.45):
    t = tt(d); f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30)) * np.exp(-t * 9)
def bell(m, d=1.6):
    t = tt(d); f = hz(m)
    return np.sin(2 * np.pi * f * t + 2.2 * np.exp(-t * 3) * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t * 3.2)
def saw(f, t, voices=3, det=0.012):
    out = 0
    for v in range(voices):
        fv = f * (1 + det * (v - (voices - 1) / 2))
        out = out + sum(np.sin(2 * np.pi * k * fv * t + v) / k for k in range(1, 12) if k * fv < 9000)
    return out / voices
def stab(chord, d=0.22):
    t = tt(d); x = sum(saw(hz(m), t) for m in chord)
    return filt(x, 'lowpass', 2400) * np.exp(-t * 12) * 0.35
def bass(m, d=0.22):
    t = tt(d); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.15 * np.sin(2 * np.pi * 3 * f * t)
    return x * np.minimum(1, t * 200) * np.exp(-t * 6)
def pad(chord, d):
    t = tt(d); x = sum(saw(hz(m), t, 4, 0.018) for m in chord)
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.8)
    return filt(x, 'lowpass', 1500) * env * 0.12
def riser(d, lo=300, hi=6000):
    t = tt(d); n = rng.standard_normal(len(t))
    out = np.zeros_like(n); seg = int(SR * 0.05)
    for s in range(0, len(n), seg):      # stepped band sweep, cheap and smooth enough
        fc = lo * (hi / lo) ** (s / len(n))
        out[s:s + seg] = filt(n[s:s + seg + 0], 'bandpass', [fc * 0.7, min(fc * 1.4, 20000)], 1)
    return out * (t / d) ** 2 * 0.5
def impact():
    t = tt(1.2)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 12)) / SR) * np.exp(-t * 3)
    return boom + filt(rng.standard_normal(len(t)), 'lowpass', 5000) * np.exp(-t * 5) * 0.4

# ---- harmony: one chord per bar, D A Bm G
CH = [dict(stab=[62, 66, 69], bass=38, arp=[74, 78, 81, 86], pad=[50, 57, 62, 66]),
      dict(stab=[61, 64, 69], bass=33, arp=[73, 76, 81, 85], pad=[45, 57, 61, 64]),
      dict(stab=[62, 66, 71], bass=35, arp=[74, 78, 83, 86], pad=[47, 59, 62, 66]),
      dict(stab=[62, 67, 71], bass=31, arp=[74, 79, 83, 86], pad=[43, 55, 62, 67])]
def chord_at(t): return CH[int((t - T0) // (4 * BEAT)) % 4] if t >= T0 else CH[0]

GROOVE = [(4.5, 20.5), (22.5, 37.5)]           # full drums
BREAK = (20.5, 22.5)                           # counter builds, 2x lands on 22.5
in_groove = lambda t: any(a <= t < b for a, b in GROOVE)

# ---- sequence on the 16th grid
step = BEAT / 4
for i in range(int(DUR / step)):
    t = T0 + i * step - 0.5                    # start half a second early for a pickup
    if t < 0 or t >= DUR: continue
    b16 = i % 16; c = chord_at(t)
    live = t < 37.5
    # arp: 8ths in the intro, 16ths in the groove, off after the end hit
    if live and (b16 % 2 == 0 or in_groove(t)) and not (BREAK[0] <= t < BREAK[1]):
        add(marimba(c['arp'][i % 4] + (12 if b16 in (6, 14) else 0)), t, 0.24, pan=0.5 * np.sin(i), send=0.25)
    if in_groove(t):
        if b16 % 4 == 0: add(kick(), t, 0.6); kick_env[int(t * SR):int(t * SR) + int(.25 * SR)] = np.exp(-tt(.25)[: max(0, min(int(.25 * SR), N - int(t * SR)))] * 12)
        if b16 in (4, 12): add(clap(), t, 0.5, send=0.3)
        add(hat(), t, 0.22 if b16 % 2 else 0.14, pan=0.45)
        if b16 % 4 == 2: add(hat(True), t, 0.17, pan=-0.45)
        if b16 % 4 == 2 or b16 in (7, 15): add(stab(c['stab']), t, 0.65, pan=-0.25, send=0.35)
        if b16 % 2 == 0: add(bass(c['bass'] + (12 if b16 % 4 == 2 else 0)), t, 0.36)
    elif t < 4.5 and t >= T0:
        if b16 % 4 == 2: add(hat(), t, 0.16, pan=0.45)
        if b16 in (4, 12): add(clap(), t, 0.4, send=0.4)
        if t >= 2.5 and b16 % 2 == 0: add(bass(c['bass'] + (12 if b16 % 4 == 2 else 0)), t, 0.3)

# pads under everything until the end card, ducked by the kick for a gentle pump
bar = 4 * BEAT
for k in range(int((37.5 - T0) / bar)):
    t = T0 + k * bar; add(pad(chord_at(t)['pad'], bar + 0.3), t, 0.9, send=0.4)

# ---- hits timed to the animation
add(riser(0.5, 800, 5000), 0.0, 0.25)
for s in (4.5, 10.2, 26.2, 31.2):              # scene changes: short swell
    add(riser(0.9), s - 0.9, 0.3, send=0.2)
for i in range(7):                             # tracker stages tick up the D major scale
    add(bell([74, 76, 78, 79, 81, 83, 86][i], 0.9), 6.0 + i * 0.5, 0.18, pan=0.2, send=0.3)
for i, s in enumerate((11.6, 12.8, 14.0, 15.2, 16.4, 17.6)):   # feature rows pop in
    add(bell([81, 83, 86, 88, 90, 93][i], 0.8), s, 0.14, pan=-0.2, send=0.35)
add(riser(2.0, 200, 9000), 20.5, 0.45)         # the counter climbs 1x to 2x
add(impact(), 22.5, 0.5, send=0.3)
add(stab([62, 66, 69, 74]), 22.5, 0.9, send=0.5)
for d, m in ((0, 86), (0.12, 93)):             # Monday settles: a bright ding-ding
    add(bell(m, 1.4), 28.9 + d, 0.2, send=0.45)
for i, s in enumerate((32.3, 32.6, 32.9, 33.2, 33.5)):          # brand cards
    add(marimba(86 + [0, 2, 4, 7, 9][i], 0.5), s, 0.13, pan=0.3, send=0.35)
add(riser(1.0), 36.5, 0.35)
add(impact(), 37.5, 0.4, send=0.4)             # end card
add(pad([50, 57, 62, 66, 69], 6.5), 37.5, 1.2, send=0.6)
for d, m in ((0, 74), (0.18, 78), (0.36, 81), (0.54, 86)):
    add(bell(m, 2.2), 39.6 + d, 0.16, send=0.55)            # "Let's talk."

# ---- mix: sidechain pump, reverb, soft limit
pump = 1 - 0.35 * kick_env
mix = dry * pump[:, None]
ir_t = tt(1.8); ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t * 3.2)[:, None]
ir = np.stack([filt(ir[:, c], 'lowpass', 6000) for c in range(2)], 1)
rev = np.stack([fftconvolve(wet[:, c] * pump, ir[:, c])[:N] for c in range(2)], 1)
mix = mix + rev * (0.35 / np.abs(rev).max() * np.abs(mix).max())
mix = filt(mix.T, 'highpass', 30).T
fade = np.ones(N); f0 = int(41.5 * SR); fade[f0:] = np.cos(np.linspace(0, np.pi / 2, N - f0))
fade[: int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
mix = mix * fade[:, None]
mix = mix / np.sqrt(np.mean(mix ** 2)) * 0.15                 # about -14 LUFS, the social-platform norm
mix = np.tanh(mix * 1.1) / np.tanh(1.1)                       # gentle limiter
mix = mix / np.abs(mix).max() * 0.89                          # about -1 dBFS peak
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', SR, (mix * 32767).astype(np.int16))
print('rms dBFS', round(20 * np.log10(np.sqrt(np.mean(mix ** 2))), 1))
