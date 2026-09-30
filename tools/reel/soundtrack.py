"""Soundtrack for the DevShop Retail OS reel: upbeat bass line with a catchy piano riff.

Real recorded instruments:
  piano  Salamander Grand Piano V2 (Yamaha C5), Alexander Holm, CC BY 3.0
         raw.githubusercontent.com/Tonejs/audio/master/salamander/
  bass   electric bass, Karoryfer (listed as a public-domain source)
         raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/bass-electric/
Kick, clap, hats and shaker are synthesised (noise and a pitched sine), as in most dance productions.

120 BPM in D (D A Bm G). The piano riff opens alone as the hook, the bass and beat drop in
at 4 s, the band breaks for the 2x build (18-20 s) and drops back in on 20 s. It ends on the
riff alone, like it starts, so the reel loops. Scene cuts in devshop-retail-os.html sit on
this beat grid (SCENES).
Usage: python3 tools/reel/soundtrack.py <samples-dir> out.wav
"""
import os, subprocess, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR, BPM = 44100, 120
BEAT = 60 / BPM; BAR = 4 * BEAT; STEP = BEAT / 4
DUR = 43.0
N = int(DUR * SR)
rng = np.random.default_rng(3)
tt = lambda d: np.arange(int(d * SR)) / SR
def filt(x, kind, f, order=2): return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x, axis=0)

# ---------------------------------------------------------------- samples
def decode(path):
    import imageio_ffmpeg
    ff = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
    raw = subprocess.run([ff, '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(float)
    on = int(np.argmax(np.abs(x).max(1) > 0.003))
    return x[max(0, on - 20):]

NOTE = {'C': 0, 'Cs': 1, 'Ds': 3, 'E': 4, 'Fs': 6, 'G': 7, 'A': 9, 'As': 10}
def load_bank(folder):
    bank = {}
    for f in os.listdir(folder):
        name, o = f[:-5], int(f[-5])
        bank[12 * (o + 1) + NOTE[name]] = decode(os.path.join(folder, f))
    return bank

def repitch(x, semis):
    if semis == 0: return x
    r = 2 ** (semis / 12); idx = np.arange(0, len(x) - 1, r)
    return np.stack([np.interp(idx, np.arange(len(x)), x[:, c]) for c in range(2)], 1)

class Inst:
    def __init__(self, bank): self.bank = bank; self.keys = np.array(sorted(bank)); self.cache = {}
    def note(self, m):
        if m not in self.cache:
            k = int(self.keys[np.argmin(np.abs(self.keys - m))]); self.cache[m] = repitch(self.bank[k], m - k)
        return self.cache[m]

# ---------------------------------------------------------------- synthesised drums
def kick():
    t = tt(0.4); f = 46 + 80 * np.exp(-t * 32)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + 0.15 * filt(rng.standard_normal(len(t)), 'bandpass', [1500, 5000]) * np.exp(-t * 300)
    return np.stack([x, x], 1)
def clap(seed):
    r = np.random.default_rng(seed); t = tt(0.3)
    n = filt(r.standard_normal(len(t)), 'bandpass', [900, 3200])
    env = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) * 75) for d in (0, .008, .017)) * .5 + (t >= .026) * np.exp(-np.clip(t - .026, 0, None) * 15)
    return np.stack([n * env * 1.05, n * env * .95], 1)
def hat(open_, seed):
    r = np.random.default_rng(100 + seed); t = tt(0.26 if open_ else 0.05)
    x = filt(r.standard_normal(len(t)), 'highpass', 7500) * np.exp(-t * (11 if open_ else 80)); return np.stack([x, x], 1)
def shaker(seed):
    r = np.random.default_rng(200 + seed); t = tt(0.08)
    x = filt(r.standard_normal(len(t)), 'bandpass', [5000, 12000]) * np.minimum(1, t / .01) * np.exp(-t * 40); return np.stack([x, x], 1)
def crash():
    t = tt(2.4); x = filt(rng.standard_normal((len(t), 2)), 'highpass', 4500) * np.exp(-t * 2.2)[:, None]; return x
def riser(d):
    t = tt(d); n = rng.standard_normal(len(t)); out = np.zeros_like(n); seg = int(.04 * SR)
    for s in range(0, len(n), seg):
        fc = 300 * (8000 / 300) ** (s / len(n)); out[s:s + seg] = filt(n[s:s + seg], 'bandpass', [fc * .7, min(fc * 1.4, 20000)], 1)
    x = out * (t / d) ** 2 * .5; return np.stack([x, x], 1)

# ---------------------------------------------------------------- music
CH = [dict(pcs={2, 6, 9}, r=38), dict(pcs={9, 1, 4}, r=33), dict(pcs={11, 2, 6}, r=35), dict(pcs={7, 11, 2}, r=31)]  # D A Bm G
# riff: step -> (top note, length in 16ths); the chord is voiced under the top note
RIFF = [{0: (69, 2), 3: (69, 2), 6: (71, 3), 10: (69, 2), 12: (66, 4)},
        {0: (64, 2), 3: (64, 2), 6: (66, 3), 10: (64, 2), 12: (61, 4)},
        {0: (66, 2), 3: (66, 2), 6: (69, 3), 10: (71, 2), 12: (74, 4)},
        {0: (74, 2), 3: (71, 2), 6: (69, 3), 10: (67, 2), 12: (69, 2), 14: (71, 2)}]
# bass: step -> (interval from root, length in 16ths); 'app' walks chromatically into the next root
BASS = {0: (0, 2), 2: (12, 1), 3: (0, 1), 6: (12, 1), 7: (7, 1), 8: (0, 2), 10: (12, 1), 11: (7, 1), 12: (0, 1), 14: (12, 1), 15: ('app', 1)}
WALK = {12: (2, 1), 13: (4, 1), 14: (5, 1), 15: (6, 1)}   # last bar of each cycle: G A B C# into D

def voice(top, pcs):
    notes, m = [top], top - 1
    while len(notes) < 3:
        if m % 12 in pcs and m % 12 != top % 12: notes.append(m)
        m -= 1
    return notes

def build(samples):
    piano = Inst(load_bank(os.path.join(samples, 'salamander')))
    bass = Inst(load_bank(os.path.join(samples, 'bass')))
    dry = np.zeros((N, 2)); wet = np.zeros((N, 2)); duck = np.zeros(N)
    def add(x, t, g=1.0, pan=0.0, send=0.0, length=None, rel=0.06, human=True):
        if human: t += rng.normal(0, .004); g *= 1 + rng.normal(0, .05)
        i = int(max(0, t) * SR)
        if i >= N: return
        x = x.copy()
        if length is not None:
            n = min(len(x), int((length + rel) * SR)); x = x[:n]; k = int(length * SR)
            if k < n: x[k:] *= np.linspace(1, 0, n - k)[:, None] ** 2
        x = x[: N - i] * g
        l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        dry[i:i + len(x), 0] += x[:, 0] * l; dry[i:i + len(x), 1] += x[:, 1] * r
        if send: wet[i:i + len(x)] += x * send

    GROOVE = [(4.0, 18.0), (20.0, 40.0)]
    grooving = lambda t: any(a <= t < b for a, b in GROOVE)
    for bi in range(int(DUR / BAR) + 1):
        t0 = bi * BAR; k = bi % 4; ch = CH[k]; nxt = CH[(k + 1) % 4]
        lift = 12 if t0 >= 28.0 and t0 < 40.0 else 0           # last choruses: riff doubled an octave up
        for s in range(16):
            t = t0 + s * STEP
            if t >= DUR - 1.0: break
            # piano riff: always on except it holds a chord through the build
            if s in RIFF[k] and not (18.0 <= t < 20.0) and t < 42.0:
                top, ln = RIFF[k][s]; vel = 1.3 if s in (0, 6) else 1.05
                for j, m in enumerate(voice(top, ch['pcs'])):
                    add(piano.note(m), t + j * .003, vel * (1 if j == 0 else .7), pan=.15 - .15 * j, send=.25, length=ln * STEP * .95)
                if lift: add(piano.note(top + 12), t, vel * .45, pan=.3, send=.3, length=ln * STEP * .9)
            if grooving(t):
                if s % 4 == 0: add(kick(), t, .42, human=False); i = int(t * SR); d = tt(.3)[: max(0, N - i)]; duck[i:i + len(d)] = np.maximum(duck[i:i + len(d)], .28 * np.exp(-d * 11))
                if s in (4, 12): add(clap(s), t, .42, send=.3)
                if s % 4 == 2: add(hat(True, s), t, .16, pan=.35)
                add(shaker(s % 4), t, .1 if s % 2 else .06, pan=-.35)
                pat = WALK if (k == 3 and s >= 12) else BASS
                if s in pat:
                    iv, ln = pat[s]
                    note = nxt['r'] + (1 if s % 2 else -1) if iv == 'app' else ch['r'] + iv
                    add(bass.note(note), t, .75, length=ln * STEP * .85, rel=.03)
    # the bass walks up into the first drop, under the run-scene wipe
    for i, m in enumerate([33, 35, 37, 38 - 1]):
        add(bass.note(m), 3.0 + i * BEAT / 2, .9, length=BEAT / 2 * .85, rel=.03)
    add(riser(1.0), 3.0, .25)
    # build to the 2x: held chords, a riser, a clap roll
    for m in voice(66, CH[1]['pcs']) + [45]: add(piano.note(m), 18.0, 1.1, send=.4, length=1.9)
    add(riser(2.0), 18.0, .45)
    for i in range(8): add(clap(i), 19.0 + i * BEAT / 4, .1 + .04 * i, send=.2)
    for t0 in (4.0, 20.0): add(crash(), t0, .2, send=.2)
    for m in (38, 50): add(bass.note(m), 20.0, .8, length=.5)
    # end: band stops on 40 s, the riff carries on alone into the loop
    add(crash(), 40.0, .16, send=.3); add(bass.note(38), 40.0, .9, length=1.2)

    g = 1 - duck
    mix = dry * g[:, None]
    ir_t = tt(1.6); ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t * 3.4)[:, None]; ir = filt(ir, 'lowpass', 6500)
    rev = np.stack([fftconvolve(wet[:, c] * g, ir[:, c])[:N] for c in range(2)], 1)
    mix = mix + rev * (.22 / (np.abs(rev).max() + 1e-9) * np.abs(mix).max())
    mix = filt(mix, 'highpass', 30)
    fade = np.ones(N); f0 = int((DUR - 1.2) * SR); fade[f0:] = np.cos(np.linspace(0, np.pi / 2, N - f0)) ** 2
    fade[: int(.01 * SR)] = np.linspace(0, 1, int(.01 * SR))
    mix *= fade[:, None]
    mix = mix / np.sqrt(np.mean(mix ** 2)) * .15
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    return mix / np.abs(mix).max() * .89

if __name__ == '__main__':
    wavfile.write(sys.argv[2], SR, (build(sys.argv[1]) * 32767).astype(np.int16))
    print('written', sys.argv[2])
