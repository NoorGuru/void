import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5199/';
const out = process.argv[3] || '/tmp/voidcap/out';
const times = (process.argv[4] || '0,4,10,16,22,28,34,40,46,52,58,64,72,80,90,100,112,124,134,142,148').split(',').map(Number);
const w = Number(process.argv[5] || 1280);
const h = Number(process.argv[6] || 720);
const lang = process.argv[7] || 'en';

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/home/noor/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
import fs from 'node:fs';
fs.mkdirSync(out, { recursive: true });
for (const t of times) {
  await page.goto(`${base}?t=${t}&lang=${lang}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/t${String(t).padStart(3, '0')}.png` });
  console.log('shot', t);
}
await browser.close();
