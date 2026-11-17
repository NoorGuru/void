import { createWorld } from './world.js';
import { createScore } from './sound.js';
import { copy, resolveLang, formatWidth } from './i18n.js';
import { monotoneInterpolator, keyInterpolator } from './motion.js';

const END = 144;
const CUES = [
  [0, 0],
  [3.6, 0],
  [8.2, 0.07],
  [13, 0.1],
  [18, 0.15],
  [24, 0.2],
  [30, 0.25],
  [36, 0.31],
  [42, 0.36],
  [49, 0.41],
  [56, 0.46],
  [63, 0.52],
  [72, 0.6],
  [80, 0.66],
  [89, 0.72],
  [98, 0.78],
  [110, 0.86],
  [122, 0.94],
  [132, 0.985],
  [138, 1],
  [144, 1],
];

// One continuous zoom, not a chain of eased segments: the monotone cubic
// keeps a non-zero rate through every interior cue, so the camera carries
// its momentum from one scale into the next instead of stopping between
// phases. Each beat gets roughly eight to twelve seconds.
const cueCurve = monotoneInterpolator(CUES);

// Phase starts, in zoom. Lines, reduced-motion steps and the score's
// bells all use these.
const PHASES = [
  ['still', 0],
  ['step', 0.06],
  ['place', 0.14],
  ['coast', 0.24],
  ['spin', 0.36],
  ['lights', 0.41],
  ['moon', 0.46],
  ['year', 0.52],
  ['planets', 0.6],
  ['dot', 0.66],
  ['sun', 0.72],
  ['disk', 0.78],
  ['galaxies', 0.86],
  ['end', 0.94],
  ['coda', 0.985],
];

// The true width of what the camera shows, in meters. The scene
// compresses sizes; this number does not.
const WIDTH = keyInterpolator(
  [
    { u: 0, v: 4 },
    { u: 0.08, v: 9 },
    { u: 0.16, v: 60 },
    { u: 0.24, v: 2000 },
    { u: 0.32, v: 1.2e5 },
    { u: 0.42, v: 1.5e7 },
    { u: 0.5, v: 1.1e9 },
    { u: 0.58, v: 4e11 },
    { u: 0.66, v: 1.2e13 },
    { u: 0.72, v: 1e14 },
    { u: 0.78, v: 4.7e17 },
    { u: 0.86, v: 1.9e20 },
    { u: 0.92, v: 1.9e21 },
    { u: 0.96, v: 4.7e22 },
    { u: 1, v: 8.8e26 },
  ],
  { log: true },
);

const FLIGHT_SECONDS = 10;

const canvas = document.getElementById('view');
const copyEl = document.querySelector('.copy');
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
const scaleEl = document.getElementById('scale');
const emberEl = document.getElementById('ember');
const emberLabel = document.getElementById('ember-label');
const veilEl = document.getElementById('veil');
const langGroup = document.getElementById('lang');
const langEn = document.getElementById('lang-en');
const langAr = document.getElementById('lang-ar');
const creditLink = document.querySelector('.credit a');
const descriptionEl = document.querySelector('meta[name="description"]');
const themeEl = document.querySelector('meta[name="theme-color"]');
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
let flight = null;
let rush = 0;

let failKind = null;
let world;
try {
  world = createWorld(canvas);
  if (playTime > 0) world.integrate(0, playTime, timeToU);
} catch (error) {
  failEl.hidden = false;
  lineEl.hidden = true;
  hintEl.hidden = true;
  failKind = error instanceof Error ? 'message' : 'webgl';
  failEl.textContent = error instanceof Error ? error.message : t().failWebgl;
  console.error(error);
}

function timeToU(time) {
  return cueCurve(Math.min(END, Math.max(0, time)));
}

function uToTime(target) {
  let lo = 0;
  let hi = END;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (timeToU(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function lineKey(u, time) {
  for (let i = PHASES.length - 1; i > 1; i--) {
    if (u >= PHASES[i][1]) return PHASES[i][0];
  }
  if (time >= 2.8 || u >= PHASES[1][1]) return 'step';
  return 'still';
}

function applySky(sky, u) {
  const ink = u < 0.305 ? '#241c16' : '#f4eee4';
  const skyCss = `rgb(${sky.r | 0}, ${sky.g | 0}, ${sky.b | 0})`;
  root.style.setProperty('--ink', ink);
  root.style.setProperty('--sky', skyCss);
  root.style.color = ink;
  document.body.style.background = skyCss;
  if (themeEl) themeEl.setAttribute('content', skyCss);
}

// Phase lines leave by lifting and blurring away; the next line arrives
// word by word, and the figures under it follow. A fast scrub swaps
// plainly so nothing lags behind the hand.
function setWords(el, text) {
  el.textContent = '';
  const words = text.split(' ');
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.style.setProperty('--i', String(i));
    span.textContent = word;
    el.append(span);
    if (i < words.length - 1) el.append(' ');
  });
}

let shownKey = 'still';
let lineToken = 0;

function paintLine(key, animate) {
  const token = ++lineToken;
  const text = t().lines[key];
  const swap = () => {
    if (token !== lineToken) return;
    setWords(lineEl, text.line);
    statEl.textContent = text.stat;
    scrubEl.setAttribute('aria-valuetext', `${text.line} ${text.stat}`);
    copyEl.classList.remove('is-leaving');
    if (animate && !reduce) {
      copyEl.classList.remove('is-entering');
      void copyEl.offsetWidth;
      copyEl.classList.add('is-entering');
    }
  };
  if (!animate || reduce) {
    copyEl.classList.remove('is-entering', 'is-leaving');
    swap();
    return;
  }
  copyEl.classList.add('is-leaving');
  window.setTimeout(swap, 380);
}

function applyLine(u, time) {
  const key = lineKey(u, time);
  if (key === shownKey) return;
  shownKey = key;
  paintLine(key, rush < 2.5);
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

let shownWidth = '';
function applyScale(u) {
  const text = formatWidth(WIDTH(u), lang);
  if (text === shownWidth) return;
  shownWidth = text;
  scaleEl.textContent = text;
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
  emberLabel.textContent = c.you;
  hintEl.textContent = hintText();
  playEl.textContent = playText();
  showSound(sound.on);
  scrubEl.setAttribute('aria-label', c.scrub);
  creditLink.setAttribute('aria-label', c.creditAria);
  langGroup.setAttribute('aria-label', c.langLabel);
  langEn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
  langAr.setAttribute('aria-pressed', lang === 'ar' ? 'true' : 'false');
  if (failKind === 'webgl') failEl.textContent = c.failWebgl;
  shownWidth = '';
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
    goHome();
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

function land() {
  flight = null;
  playTime = 0;
  frame.prevTime = 0;
  world.reset();
  copyEl.classList.remove('is-away');
  shownKey = '';
  hintGone = true;
  setPlaying(false);
  sound.home();
}

// The way back: the whole zoom in reverse, eased at both ends, landing
// where the piece began, with the person still standing there.
function goHome() {
  cancelFlight();
  setPlaying(false);
  if (reduce || !world) {
    land();
    return;
  }
  flight = { from: playTime, start: performance.now() };
  copyEl.classList.add('is-away');
  againEl.hidden = true;
  noteEl.hidden = true;
  sound.fly();
}

function cancelFlight() {
  if (!flight) return;
  flight = null;
  copyEl.classList.remove('is-away');
}

function step(dir) {
  const u = timeToU(playTime);
  const marks = [...PHASES.map(([, at]) => at).slice(1), 1];
  let target = dir > 0 ? 1 : 0;
  if (dir > 0) {
    target = marks.find((m) => m > u + 0.005) ?? 1;
  } else {
    target = 0;
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i] < u - 0.005) {
        target = marks[i];
        break;
      }
    }
  }
  playTime = target <= 0 ? 0 : uToTime(target + 0.004);
  setPlaying(false);
}

const sound = createScore();

beginEl.addEventListener('click', begin);
playEl.addEventListener('click', togglePlay);
againEl.addEventListener('click', goHome);
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
  cancelFlight();
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
    cancelFlight();
    playTime = Math.min(END, playTime + 2);
    setPlaying(false);
  } else if (begun && event.code === 'ArrowLeft') {
    cancelFlight();
    playTime = Math.max(0, playTime - 2);
    setPlaying(false);
  }
});

window.addEventListener(
  'wheel',
  (event) => {
    if (!begun || event.target === scrubEl) return;
    event.preventDefault();
    cancelFlight();
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
  cancelFlight();
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

function easeInOut(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

let last = performance.now();
let lastCoda = false;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (flight) {
    const k = Math.min(1, (now - flight.start) / (FLIGHT_SECONDS * 1000));
    playTime = flight.from * (1 - easeInOut(k));
    if (k >= 1) land();
  } else if (playing) {
    playTime = Math.min(END, playTime + dt);
  }
  if (playTime >= END && playing) setPlaying(false);

  const u = timeToU(playTime);
  let stepped = false;
  if (world) {
    const dPlay = playTime - frame.prevTime;
    rush = Math.abs(dPlay) / Math.max(dt, 0.016);
    if (dPlay !== 0) world.integrate(frame.prevTime, playTime, timeToU);
    frame.prevTime = playTime;

    const view = world.render(u, playTime, window.innerWidth, window.innerHeight);
    stepped = view.stepped;
    applySky(view.sky, u);
    veilEl.style.opacity = String(view.veil);
    const e = view.ember;
    emberEl.style.opacity = String(e.a);
    emberEl.style.transform = `translate3d(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px, 0)`;
    emberEl.style.setProperty('--label', String(e.label));
  }
  sound.update(u, dt, stepped, rush, Boolean(flight));

  if (!flight) applyLine(u, playTime);
  applyScale(u);
  scrubEl.value = String((playTime / END) * 1000);

  const atEnd = u > 0.985 && !flight;
  if (atEnd && !lastCoda) sound.swell();
  lastCoda = atEnd;
  noteEl.hidden = !atEnd;
  againEl.hidden = !atEnd;
  beginEl.hidden = begun;
  playEl.hidden = !begun || (atEnd && !reduce) || Boolean(flight);
  scaleEl.classList.toggle('is-on', begun);
  if (begun && !hintGone && (playTime > 5 || u > 0.08)) hintGone = true;
  hintEl.classList.toggle('is-gone', !begun || hintGone || atEnd);

  requestAnimationFrame(frame);
}

frame.prevTime = playTime;
requestAnimationFrame(frame);
