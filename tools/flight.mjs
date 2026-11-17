import { chromium } from 'playwright-core';
import fs from 'node:fs';

// Loads the end of the piece, presses Go home, and captures the flight.
const base = process.argv[2] || 'http://localhost:5199/';
const out = process.argv[3] || '/tmp/voidcap/flight';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/home/noor/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}?t=140`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/f00-end.png` });
await page.click('#again');
for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(1500);
  const time = await page.evaluate(() => document.getElementById('scrub').value);
  await page.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}-${time}.png` });
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/f99-home.png` });
await browser.close();
