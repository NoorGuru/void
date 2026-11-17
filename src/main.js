import { createWorld } from './world.js';
import { createScore } from './sound.js';
import { monotoneInterpolator } from './motion.js';

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

// One continuous zoom, not a chain of eased segments: the monotone cubic
// keeps a non-zero rate through every interior cue, so the camera carries
// its momentum from one scale into the next instead of stopping between
// phases. (It still waits, deliberately, over the opening cue where the
// person has not moved yet, and settles at the very end.)
const cueCurve = monotoneInterpolator(CUES);

function timeToU(time) {
  return cueCurve(Math.min(END, Math.max(0, time)));
}

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
const root = document.documentElement;

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
if (coarse) hintEl.textContent = 'Wait, or drag.';

const params = new URLSearchParams(location.search);
let playTime = params.has('t') ? Number(params.get('t')) : 0;
let begun = params.has('t');
let playing = begun && params.get('play') === '1' && !reduce;
let hintGone = false;

if (reduce) {
  playing = false;
  playEl.textContent = 'Farther';
  hintEl.textContent = 'Step through, or drag.';
}

let world;
try {
  world = createWorld(canvas);
  if (playTime > 0) world.integrate(playTime, 0, timeToU(playTime), reduce);
} catch (error) {
  failEl.hidden = false;
  lineEl.hidden = true;
  hintEl.hidden = true;
  failEl.textContent = error instanceof Error ? error.message : 'This piece needs WebGL.';
  console.error(error);
}

function currentLine(u, time) {
  if (u >= 0.94) {
    return {
      line: 'There is no middle left to stand in.',
      stat: 'About 93 billion light-years across. Most of that distance is nothing.',
    };
  }
  if (u >= 0.86) {
    return {
      line: 'Past this, the motions stop sharing a center.',
      stat: 'Andromeda is 2.5 million light-years away. The gap between galaxies is almost empty.',
    };
  }
  if (u >= 0.78) {
    return {
      line: 'The whole disk turns. The inside pulls ahead.',
      stat: 'One turn takes about 230 million years. The near side is coming toward you.',
    };
  }
  if (u >= 0.7) {
    return {
      line: 'The center you found is leaving too.',
      stat: 'The Sun moves at about 220 km/s, and it rises and falls through the disk as it goes.',
    };
  }
  if (u >= 0.6) {
    return {
      line: 'The fall is not a single circle.',
      stat: 'The outer worlds sit billions of kilometers farther out, and they move more slowly.',
    };
  }
  if (u >= 0.52) {
    return {
      line: 'You are not the center. You are riding one.',
      stat: '150 million kilometers out. The world comes toward you, then falls away. One trip is a year.',
    };
  }
  if (u >= 0.46) {
    return {
      line: 'Something else is falling, and it never lands.',
      stat: 'The Moon is 384,000 kilometers away. It goes around once a month.',
    };
  }
  if (u >= 0.36) {
    return {
      line: 'The world turns all the way around.',
      stat: 'About 1,670 kilometers an hour at the equator. One full turn is a day.',
    };
  }
  if (u >= 0.24) {
    return {
      line: 'The edge you could not see was a coastline.',
      stat: 'A country spans hundreds of kilometers. Earth is 12,742 kilometers across.',
    };
  }
  if (u >= 0.14) {
    return {
      line: 'A place is what you can still walk back to.',
      stat: 'A few hundred meters. You could cross it before dark.',
    };
  }
  if (time >= 2.8 || u >= 0.06) {
    return {
      line: 'The first motion is yours, and it is small.',
      stat: 'About 0.7 meters a step. A life is a few hundred million of them.',
    };
  }
  return {
    line: 'You have not moved yet.',
    stat: '1.8 meters tall. Everything else is measured from here.',
  };
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

let shownLine = 'You have not moved yet.';

function applyLine(u, time) {
  const next = currentLine(u, time);
  if (next.line === shownLine) return;
  shownLine = next.line;
  const swap = () => {
    lineEl.textContent = next.line;
    statEl.textContent = next.stat;
    scrubEl.setAttribute('aria-valuetext', `${next.line} ${next.stat}`);
  };
  if (reduce) {
    swap();
    return;
  }
  lineEl.style.opacity = '0';
  statEl.style.opacity = '0';
  window.setTimeout(() => {
    swap();
    lineEl.style.opacity = '1';
    statEl.style.opacity = '1';
  }, 220);
}

function setPlaying(next) {
  playing = next;
  if (!reduce) playEl.textContent = playing ? 'Pause' : 'Play';
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
  soundEl.textContent = on ? 'Sound on' : 'Sound off';
  soundEl.setAttribute('aria-pressed', on ? 'true' : 'false');
}

soundEl.addEventListener('click', () => {
  showSound(sound.on ? sound.stop() : sound.start());
});

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
