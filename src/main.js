import { createWorld } from './world.js';
import { createScore } from './sound.js';
import { copy, resolveLang, formatWidth, LANG_MARKS, otherLang } from './i18n.js';
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

// Meters per scene unit in each frame of reference. Sizes are compressed
// differently at each scale (the person is 1.7 units tall, the Earth 400
// units in radius, its orbit 1760), so the true width of the view is the
// camera's span times the scale that owns the frame at that moment.
const METERS_PER_UNIT = keyInterpolator(
  [
    { u: 0, v: 1 },
    { u: 0.16, v: 1 },
    { u: 0.3, v: 6.371e6 / 400 },
    { u: 0.47, v: 6.371e6 / 400 },
    { u: 0.62, v: 1.496e11 / 1760 },
    { u: 0.72, v: 1.496e11 / 1760 },
    { u: 0.84, v: 2.46e20 / 6240 },
    { u: 0.88, v: 2.46e20 / 6240 },
    { u: 0.94, v: 2.4e22 / 60000 },
    { u: 1, v: 8.8e26 / 1.74e6 },
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
const langToggleEl = document.getElementById('lang-toggle');
const scrubEl = document.getElementById('scrub');
const failEl = document.getElementById('fail');
const aboutEl = document.getElementById('about');
const scaleEl = document.getElementById('scale');
const dockEl = document.querySelector('.dock');
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
let stage = begun && playTime > 0.5 ? 'run' : 'start';
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

// The ink follows the frame behind the words (sampled by the renderer),
// with a gap between the two thresholds so it does not flicker at the
// edge. Until there is a sample, the zoom position decides.
let darkInk = true;
let darkChrome = true;
let sampled = false;

function judge(dark, luma, veil) {
  const seen = luma * (1 - veil) + 0.05 * veil;
  if (dark && seen < 0.36) return false;
  if (!dark && seen > 0.52) return true;
  return dark;
}

function judgeInk(lumas, veil, u) {
  if (!lumas || lumas[0] == null) {
    if (!sampled) darkInk = darkChrome = u < 0.305;
    return;
  }
  sampled = true;
  darkInk = judge(darkInk, lumas[0], veil);
  darkChrome = judge(darkChrome, lumas[1], veil);
}

function probeRects() {
  const a = lineEl.getBoundingClientRect();
  const b = statEl.getBoundingClientRect();
  const left = Math.min(a.left, b.left);
  const right = Math.max(a.right, b.right);
  const d = dockEl.getBoundingClientRect();
  return [
    { x: left, y: a.top, w: right - left, h: b.bottom - a.top },
    { x: d.left, y: d.top, w: d.width, h: d.height },
  ];
}

function applySky(sky) {
  const ink = darkInk ? '#241c16' : '#f4eee4';
  const skyCss = `rgb(${sky.r | 0}, ${sky.g | 0}, ${sky.b | 0})`;
  root.style.setProperty('--ink', ink);
  root.style.setProperty('--halo', darkInk ? 'rgba(255, 238, 216, 0.5)' : 'rgba(12, 9, 7, 0.6)');
  root.style.setProperty('--chrome', darkChrome ? '#241c16' : '#f4eee4');
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
  copyEl.classList.remove('is-entering');
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

function syncPlay() {
  const state = reduce ? 'step' : (playing ? 'pause' : 'play');
  const label = reduce ? t().farther : (playing ? t().pause : t().play);
  playEl.dataset.state = state;
  playEl.setAttribute('aria-label', label);
  playEl.title = label;
}

function syncNear() {
  nearEl.dataset.state = 'back';
  nearEl.setAttribute('aria-label', t().closer);
  nearEl.title = t().closer;
}

function syncLangToggle() {
  const target = otherLang(lang);
  langToggleEl.dataset.target = target;
  const mark = langToggleEl.querySelector('.lang-mark');
  if (mark) mark.textContent = LANG_MARKS[target];
  const label = t().langSwitchTo;
  langToggleEl.setAttribute('aria-label', label);
  langToggleEl.title = label;
}

let shownWidth = '';
function applyScale(u, span) {
  if (!span) return;
  const text = formatWidth(span * METERS_PER_UNIT(u), lang);
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
  syncNear();
  noteEl.textContent = c.note;
  emberLabel.textContent = c.you;
  hintEl.textContent = hintText();
  syncPlay();
  syncLangToggle();
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

function enterRun() {
  stage = 'run';
}

// Keep the screen lit while the piece is moving on its own. Phones and
// laptops otherwise dim mid-journey. The lock drops when the tab hides;
// visibilitychange asks for it again when we come back still playing.
let wakeLock = null;

function wantWake() {
  return Boolean(playing || flight);
}

async function syncWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (wantWake()) {
    if (wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!wantWake()) {
        await lock.release();
        return;
      }
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
    } catch {
      // Battery saver, permissions, or a blocked request. Playback still runs.
    }
  } else if (wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    try {
      await lock.release();
    } catch {
      // Already released by the browser.
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncWakeLock();
});

function setPlaying(next) {
  if (next) enterRun();
  playing = next;
  syncPlay();
  syncWakeLock();
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
  enterRun();
  begun = true;
  beginEl.hidden = true;
  playEl.hidden = false;
  hintEl.hidden = false;
  if (sound.on) sound.start();
  if (!reduce) setPlaying(true);
  else nearEl.hidden = false;
}

function land() {
  stage = 'home';
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
  copyEl.classList.remove('is-entering');
  copyEl.classList.add('is-away');
  againEl.hidden = true;
  noteEl.hidden = true;
  syncWakeLock();
  sound.fly();
}

function cancelFlight() {
  if (!flight) return;
  flight = null;
  copyEl.classList.remove('is-away');
  syncWakeLock();
}

function step(dir) {
  enterRun();
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
  const state = on ? 'on' : 'off';
  const label = on ? t().soundOn : t().soundOff;
  soundEl.dataset.state = state;
  soundEl.setAttribute('aria-label', label);
  soundEl.title = label;
  soundEl.setAttribute('aria-pressed', on ? 'true' : 'false');
}

soundEl.addEventListener('click', () => {
  showSound(sound.on ? sound.stop() : sound.start());
});
langEn.addEventListener('click', () => chooseLang('en'));
langAr.addEventListener('click', () => chooseLang('ar'));
langToggleEl.addEventListener('click', () => chooseLang(otherLang(lang)));
applyLocale();

window.addEventListener('pointerdown', () => sound.unlock());
window.addEventListener('keydown', () => sound.unlock());

scrubEl.addEventListener('input', () => {
  if (!begun) return;
  enterRun();
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
    enterRun();
    cancelFlight();
    playTime = Math.min(END, playTime + 2);
    setPlaying(false);
  } else if (begun && event.code === 'ArrowLeft') {
    enterRun();
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
    enterRun();
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
  enterRun();
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
let frameCount = 0;
let lastSpan = 0;

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

    frameCount += 1;
    const probes = frameCount % 10 === 1 ? probeRects() : null;
    const view = world.render(u, playTime, window.innerWidth, window.innerHeight, probes);
    stepped = view.stepped;
    lastSpan = view.span;
    if (probes) judgeInk(view.luma, view.veil, u);
    applySky(view.sky);
    veilEl.style.opacity = String(view.veil);
    const e = view.ember;
    emberEl.style.opacity = String(e.a);
    emberEl.style.transform = `translate3d(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px, 0)`;
    emberEl.style.setProperty('--label', String(e.label));
  }
  sound.update(u, dt, stepped, rush, Boolean(flight));

  if (!flight) applyLine(u, playTime);
  applyScale(u, lastSpan);
  scrubEl.value = String((playTime / END) * 1000);
  scrubEl.style.setProperty('--p', `${(playTime / END) * 100}%`);

  root.classList.toggle('is-running', stage === 'run');
  langToggleEl.hidden = stage !== 'run';

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
syncWakeLock();
requestAnimationFrame(frame);
