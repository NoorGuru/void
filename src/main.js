import { createWorld } from './world.js';
import { createScore } from './sound.js';
import { copy, resolveLang } from './i18n.js';

const END = 150;
const CUES = [
  [0, 0],
  [3.6, 0],
  [8.2, 0.07],
  [13, 0.1],
  [18, 0.16],
  [24, 0.2],
  [31, 0.3],
  [37, 0.34],
  [45, 0.44],
  [52, 0.48],
  [58, 0.54],
  [66, 0.62],
  [74, 0.68],
  [86, 0.74],
  [104, 0.8],
  [124, 0.86],
  [136, 0.94],
  [144, 1],
  [150, 1],
];

const canvas = document.getElementById('view');
const lineEl = document.getElementById('line');
const hintEl = document.getElementById('hint');
const noteEl = document.getElementById('note');
const againEl = document.getElementById('again');
const beginEl = document.getElementById('begin');
const statEl = document.getElementById('stat');
const playEl = document.getElementById('play');
const nearEl = document.getElementById('near');
const soundEl = document.getElementById('sound');
const scrubEl = document.getElementById('scrub');
const failEl = document.getElementById('fail');
const aboutEl = document.getElementById('about');
const langGroup = document.getElementById('lang');
const langEn = document.getElementById('lang-en');
const langAr = document.getElementById('lang-ar');
const creditLink = document.querySelector('.credit a');
const descriptionEl = document.querySelector('meta[name="description"]');
const root = document.documentElement;

let lang = resolveLang();
const t = () => copy[lang];

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;

const params = new URLSearchParams(location.search);
let playTime = params.has('t') ? Number(params.get('t')) : 0;
let begun = params.has('t');
let playing = begun && params.get('play') === '1' && !reduce;
let hintGone = false;

if (reduce) playing = false;

let failKind = null;
let world;
try {
  world = createWorld(canvas);
  if (playTime > 0) world.integrate(playTime, 0, timeToU(playTime), reduce);
} catch (error) {
  failEl.hidden = false;
  lineEl.hidden = true;
  hintEl.hidden = true;
  failKind = error instanceof Error ? 'message' : 'webgl';
  failEl.textContent = error instanceof Error ? error.message : t().failWebgl;
  console.error(error);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function timeToU(time) {
  const t = Math.min(END, Math.max(0, time));
  for (let i = 0; i < CUES.length - 1; i++) {
    const [t0, u0] = CUES[i];
    const [t1, u1] = CUES[i + 1];
    if (t <= t1) {
      const k = smoothstep(t0, t1, t);
      return u0 + (u1 - u0) * k;
    }
  }
  return 1;
}

function lineKey(u, time) {
  if (u >= 0.94) return 'end';
  if (u >= 0.86) return 'galaxies';
  if (u >= 0.78) return 'disk';
  if (u >= 0.7) return 'sun';
  if (u >= 0.6) return 'planets';
  if (u >= 0.52) return 'year';
  if (u >= 0.46) return 'moon';
  if (u >= 0.36) return 'spin';
  if (u >= 0.24) return 'coast';
  if (u >= 0.14) return 'place';
  if (time >= 2.8 || u >= 0.06) return 'step';
  return 'still';
}

function applySky(sky, u) {
  const ink = u < 0.27 ? '#241c16' : '#f4eee4';
  const skyCss = `rgb(${sky.r | 0}, ${sky.g | 0}, ${sky.b | 0})`;
  root.style.setProperty('--ink', ink);
  root.style.setProperty('--sky', skyCss);
  root.style.color = ink;
  document.body.style.background = skyCss;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', skyCss);
}

let shownKey = 'still';
let lineToken = 0;

function paintLine(key, animate) {
  const token = ++lineToken;
  const text = t().lines[key];
  const swap = () => {
    if (token !== lineToken) return;
    lineEl.textContent = text.line;
    statEl.textContent = text.stat;
    scrubEl.setAttribute('aria-valuetext', `${text.line} ${text.stat}`);
    lineEl.style.opacity = '1';
    statEl.style.opacity = '1';
  };
  if (!animate || reduce) {
    swap();
    return;
  }
  lineEl.style.opacity = '0';
  statEl.style.opacity = '0';
  window.setTimeout(swap, 220);
}

function applyLine(u, time) {
  const key = lineKey(u, time);
  if (key === shownKey) return;
  shownKey = key;
  paintLine(key, true);
}

function hintText() {
  if (reduce) return t().hintStep;
  if (coarse) return t().hintDrag;
  return t().hintScroll;
}

function playText() {
  if (reduce) return t().farther;
  return playing ? t().pause : t().play;
}

function applyLocale() {
  const c = t();
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = c.title;
  if (descriptionEl) descriptionEl.setAttribute('content', c.description);
  aboutEl.textContent = c.sr;
  beginEl.textContent = c.begin;
  againEl.textContent = c.again;
  nearEl.textContent = c.closer;
  noteEl.textContent = c.note;
  hintEl.textContent = hintText();
  playEl.textContent = playText();
  showSound(sound.on);
  scrubEl.setAttribute('aria-label', c.scrub);
  creditLink.setAttribute('aria-label', c.creditAria);
  langGroup.setAttribute('aria-label', c.langLabel);
  langEn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
  langAr.setAttribute('aria-pressed', lang === 'ar' ? 'true' : 'false');
  if (failKind === 'webgl') failEl.textContent = c.failWebgl;
  paintLine(shownKey, false);
}

function chooseLang(next) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem('void-lang', lang);
  } catch {
    // Storage can be blocked. The choice still applies for this visit.
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  applyLocale();
}

function setPlaying(next) {
  playing = next;
  if (!reduce) playEl.textContent = playing ? t().pause : t().play;
}

function togglePlay() {
  if (reduce) {
    step(1);
    return;
  }
  if (playTime >= END - 0.05) {
    restart();
    return;
  }
  setPlaying(!playing);
}

function begin() {
  begun = true;
  beginEl.hidden = true;
  playEl.hidden = false;
  hintEl.hidden = false;
  if (sound.on) sound.start();
  if (!reduce) setPlaying(true);
  else nearEl.hidden = false;
}

function restart() {
  playTime = 0;
  frame.prevTime = 0;
  frame.prevU = 0;
  world.reset();
  hintGone = false;
  hintEl.hidden = false;
  hintEl.classList.remove('is-gone');
  begun = true;
  beginEl.hidden = true;
  setPlaying(!reduce);
  againEl.hidden = true;
  noteEl.hidden = true;
  playEl.hidden = false;
}

function step(dir) {
  const u = timeToU(playTime);
  const marks = [0, 0.08, 0.16, 0.28, 0.4, 0.5, 0.58, 0.68, 0.78, 0.88, 1];
  let target = dir > 0 ? 1 : 0;
  if (dir > 0) {
    target = marks.find((m) => m > u + 0.02) ?? 1;
  } else {
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i] < u - 0.02) {
        target = marks[i];
        break;
      }
    }
  }
  let lo = 0;
  let hi = END;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (timeToU(mid) < target) lo = mid;
    else hi = mid;
  }
  playTime = (lo + hi) / 2;
  setPlaying(false);
}

const sound = createScore();

beginEl.addEventListener('click', begin);
playEl.addEventListener('click', togglePlay);
againEl.addEventListener('click', restart);
nearEl.addEventListener('click', () => step(-1));
function showSound(on) {
  soundEl.textContent = on ? t().soundOn : t().soundOff;
  soundEl.setAttribute('aria-pressed', on ? 'true' : 'false');
}

soundEl.addEventListener('click', () => {
  showSound(sound.on ? sound.stop() : sound.start());
});
langEn.addEventListener('click', () => chooseLang('en'));
langAr.addEventListener('click', () => chooseLang('ar'));
applyLocale();

window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

scrubEl.addEventListener('input', () => {
  if (!begun) return;
  playTime = (Number(scrubEl.value) / 1000) * END;
  setPlaying(false);
  hintGone = true;
});

window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, button')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (!begun) begin();
    else togglePlay();
  } else if (begun && event.code === 'ArrowRight') {
    playTime = Math.min(END, playTime + 2);
    setPlaying(false);
  } else if (begun && event.code === 'ArrowLeft') {
    playTime = Math.max(0, playTime - 2);
    setPlaying(false);
  }
});

window.addEventListener(
  'wheel',
  (event) => {
    if (!begun || event.target === scrubEl) return;
    event.preventDefault();
    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    if (event.deltaMode === 2) dy *= window.innerHeight;
    playTime = Math.min(END, Math.max(0, playTime + dy * 0.016));
    setPlaying(false);
    hintGone = true;
  },
  { passive: false },
);

let drag = null;
window.addEventListener('pointerdown', (event) => {
  if (!begun || event.target.closest('button, input, a')) return;
  drag = { y: event.clientY, t: playTime, id: event.pointerId };
});
window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dy = event.clientY - drag.y;
  if (Math.abs(dy) < 3) return;
  playTime = Math.min(END, Math.max(0, drag.t - (dy / window.innerHeight) * END * 0.85));
  setPlaying(false);
  hintGone = true;
});
window.addEventListener('pointerup', (event) => {
  if (drag && event.pointerId === drag.id) drag = null;
});
window.addEventListener('pointercancel', () => {
  drag = null;
});

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) playTime = Math.min(END, playTime + dt);
  if (playTime >= END) setPlaying(false);

  const u = timeToU(playTime);
  let stepped = false;
  let rush = 0;
  if (world) {
    const dPlay = playTime - frame.prevTime;
    rush = Math.abs(dPlay) / Math.max(dt, 0.016);
    if (dPlay !== 0) world.integrate(dPlay, frame.prevU, u, reduce);
    frame.prevTime = playTime;
    frame.prevU = u;

    const view = world.render(u, playTime, window.innerWidth, window.innerHeight);
    stepped = view.stepped;
    applySky(view.sky, u);
    const veil = document.getElementById('veil');
    veil.style.opacity = String(view.veil);
  }
  sound.update(u, dt, stepped, rush);

  applyLine(u, playTime);
  scrubEl.value = String((playTime / END) * 1000);

  const atEnd = u > 0.985;
  noteEl.hidden = !atEnd;
  againEl.hidden = !atEnd;
  beginEl.hidden = begun;
  playEl.hidden = !begun || (atEnd && !reduce);
  if (begun && !hintGone && (playTime > 5 || u > 0.08)) hintGone = true;
  hintEl.classList.toggle('is-gone', !begun || hintGone || atEnd);

  requestAnimationFrame(frame);
}

frame.prevTime = playTime;
frame.prevU = timeToU(playTime);
requestAnimationFrame(frame);
