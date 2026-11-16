// Renders the Ink Studio promo (storyboard: promo2.html) to an MP4.
// For the first film: PROMO_URL=http://localhost:8766/marketing-video/promo.html PROMO_OUT="../Ink Studio promo.mp4" node render.mjs
//
//   1. serve the Ink Studio folder:   python3 -m http.server 8766 --directory ..
//   2. run:                           node render.mjs            (full video)
//                                     node render.mjs vertical   (1080x1920 for stories and reels)
//                                     node render.mjs preview    (one still per second, no video; add "vertical" too if wanted)
//
// It opens promo.html in headless Chrome, advances it one frame at a time, saves a screenshot of each
// frame and lets ffmpeg stitch them together. Needs Google Chrome, Node 22+ and ffmpeg.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), preview = args.includes('preview'), vertical = args.includes('vertical');
const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
const URL_ = (process.env.PROMO_URL || 'http://localhost:8766/marketing-video/promo2.html') + (vertical ? '?vertical' : '');
const OUT = process.env.PROMO_OUT || join(here, '..', vertical ? 'Ink Studio promo 2 vertical.mp4' : 'Ink Studio promo 2.mp4');
const WORK = process.env.PROMO_WORK || join(tmpdir(), 'ink-studio-promo');
const FRAMES = join(WORK, (preview ? 'preview' : 'frames') + (vertical ? '-vertical' : ''));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(WORK, 'chrome')}`, '--no-first-run',
  '--hide-scrollbars', `--window-size=${W},${H}`, '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 't=' + Date.now() });   // never a cached copy of the storyboard
  for (let i = 0; i < 150 && !(await evaluate('window.__ready === true').catch(() => false)); i++) await sleep(200);
  if (!(await evaluate('window.__ready === true'))) throw new Error('promo.html did not become ready (is the folder being served on port 8766?)');

  const total = await evaluate('window.__total'), fps = await evaluate('window.__fps');
  const t0 = Date.now(); let saved = 0;
  for (let f = 0; f < total; f++) {
    await evaluate(`window.__tick(${f})`);
    if (preview && f % fps !== fps / 2) continue;
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
    writeFileSync(join(FRAMES, `${preview ? 's' : 'f'}${String(preview ? saved : f).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    saved++;
    if (!preview && f % 90 === 0) console.log(`frame ${f}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ws.close();
  if (preview) console.log(`preview: ${saved} stills in ${FRAMES}`);
  else {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(FRAMES, 'f%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
    console.log(`done: ${OUT}  (${total} frames, ${(total / fps).toFixed(0)}s)`);
  }
} finally {
  chrome.kill();
}
