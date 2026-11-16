// Renders the example pictures listed in examples.html into ../examples/ as 1024 px PNGs.
//
//   1. serve the Ink Studio folder:   python3 -m http.server 8766 --directory ..
//   2. run:                           node make-examples.mjs
//      (EXAMPLES_URL and EXAMPLES_OUT point it at another recipe page and folder, e.g. brand-j.html)
//
// Needs Google Chrome and Node 22+.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.EXAMPLES_URL || 'http://localhost:8766/marketing-video/examples.html';
const OUT = process.env.EXAMPLES_OUT || join(here, '..', 'examples');
const WORK = process.env.PROMO_WORK || join(tmpdir(), 'ink-studio-promo');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;

mkdirSync(OUT, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(WORK, 'chrome-examples')}`, '--no-first-run',
  '--hide-scrollbars', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.navigate', { url: URL_ + (URL_.includes('?') ? '&' : '?') + 't=' + Date.now() });   // never a cached copy of the recipe page
  for (let i = 0; i < 100 && !(await evaluate('window.__ready === true').catch(() => false)); i++) await sleep(200);
  const count = await evaluate('window.__count');
  const only = process.argv[2] ? [+process.argv[2] - 1] : [...Array(count).keys()];
  for (const i of only) {
    const { name, data } = await evaluate(`window.__make(${i})`);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${name}.png`);
  }
  ws.close();
} finally {
  chrome.kill();
}
