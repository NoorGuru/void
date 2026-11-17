import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const outFile = process.argv[3];
const cols = Number(process.argv[4] || 3);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && f.startsWith('t')).sort();
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;font:14px sans-serif;color:#fff">
${files.map((f) => `<div style="position:relative"><img style="width:100%;display:block" src="file://${path.join(dir, f)}"><span style="position:absolute;top:4px;left:6px;background:#000a;padding:2px 6px">${f}</span></div>`).join('')}
</body></html>`;
const tmp = path.join(dir, 'sheet.html');
fs.writeFileSync(tmp, html);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/home/noor/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
await page.goto('file://' + tmp);
await page.waitForTimeout(500);
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();
