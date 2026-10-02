// Renders promo.html frame by frame (deterministic timeline) and pipes PNGs into ffmpeg.
// Usage: node promo/render.mjs <ffmpeg-binary> [--frames 0.5,3,5]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const [ffmpeg, flag, list] = process.argv.slice(2);
const FPS = 30, DUR = 10;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.join(dir, 'promo.html') + '?capture');
await page.waitForLoadState('load');

if (flag === '--frames') {
  for (const t of list.split(',')) {
    await page.evaluate((t) => window.render(t), Number(t));
    await page.screenshot({ path: path.join(dir, `frame-${t}.png`) });
  }
} else {
  const out = path.join(dir, 'mytime-reklame.mp4');
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < FPS * DUR; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
