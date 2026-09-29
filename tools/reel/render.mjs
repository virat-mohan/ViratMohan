// Render a reel page (window.seek(t), window.DURATION) to MP4, frame by frame.
// Usage: node tools/reel/render.mjs [page.html] [out.mp4] [--stills 2,8,15]
// Needs Playwright (global is fine) and an ffmpeg binary (FFMPEG env or PATH).
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright'); } catch { pw = req(execSync('npm root -g').toString().trim() + '/playwright'); }

const args = process.argv.slice(2);
const si = args.indexOf('--stills');
const stillsAt = si >= 0 ? args[si + 1].split(',').map(Number) : null;
const [page = 'tools/reel/devshop-retail-os.html', out = 'out/reel.mp4'] = args.filter((a, i) => si < 0 || (i !== si && i !== si + 1));
const FPS = 30;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const browser = await pw.chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await tab.goto(pathToFileURL(resolve(page)).href);
await tab.evaluate(() => document.fonts.ready);
await tab.waitForLoadState('networkidle');

if (stillsAt) {
  for (const t of stillsAt) {
    await tab.evaluate((t) => window.seek(t), t);
    await tab.screenshot({ path: resolve(dirname(out), `still-${t}.png`) });
  }
} else {
  const total = Math.round((await tab.evaluate(() => window.DURATION)) * FPS);
  const enc = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.REEL_CRF || '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(out)],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    await tab.evaluate((t) => window.seek(t), f / FPS);
    const buf = await tab.screenshot(process.env.REEL_PNG ? { type: 'png' } : { type: 'jpeg', quality: 95 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  enc.stdin.end();
  await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
  console.log('wrote', out);
}
await browser.close();
