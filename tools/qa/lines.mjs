// QA screenshot of lines.html (not shipped): node qa/lines.mjs /work/lines.png
import fs from 'node:fs';
import { launch, serve, ORIGIN } from '../lib/browser.mjs';
const b = await launch(); const c = await b.newContext({ viewport: { width: 1980, height: 760 } }); await serve(c);
const p = await c.newPage(); p.on('pageerror', (e) => console.error(e.message));
await p.goto(ORIGIN + '/tools/qa/lines.html'); await p.waitForFunction(() => window.__READY, null, { timeout: 60000 });
fs.writeFileSync(process.argv[2], await p.screenshot({ fullPage: true })); await b.close();
