function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const BELLS = [0.14, 0.24, 0.36, 0.46, 0.54, 0.64, 0.72, 0.8, 0.88];
const NOTES = [246.9, 220, 196, 174.6, 146.8, 130.8, 110, 98, 82.4];

export function createScore() {
  let ctx;
  let master;
  let body;
  let fifth;
  let air;
  let pulse;
  let veilTone;
  let wanted = true;
  let clock = 0;
  let lastWhoosh = -10;
  let stage = -1;

  function hall() {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 2.6);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const early = i < rate * 0.04 ? 0.35 : 1;
        data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.6 * early * (channel ? 0.82 : 1);
      }
    }
    return buffer;
  }

  function tone(type, freq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    return { osc, gain };
  }

  function noiseBed() {
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    return { filter, gain };
  }

  function burst(freq, seconds, level, type = 'sine') {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), t + seconds);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function foot() {
    burst(120, 0.18, 0.07);
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 280;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  function bell(freq) {
    burst(freq, 2.4, 0.045);
    burst(freq * 2.01, 1.6, 0.012, 'triangle');
  }

  function whoosh() {
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.7);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.04, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + 0.8);
  }

  function start() {
    wanted = true;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0;

      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = 0.78;
      wet.gain.value = 0.46;
      const convolver = ctx.createConvolver();
      convolver.buffer = hall();
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = 0.37;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 1200;

      master.connect(dry);
      master.connect(convolver);
      convolver.connect(wet);
      master.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delayFilter.connect(wet);
      dry.connect(ctx.destination);
      wet.connect(ctx.destination);

      body = tone('sine', 55);
      fifth = tone('triangle', 82.5);
      air = noiseBed();
      pulse = tone('sine', 42);
      veilTone = tone('sine', 392);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function stop() {
    wanted = false;
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    return false;
  }

  function unlock() {
    if (wanted && ctx && ctx.state === 'suspended') ctx.resume();
  }

  function update(u, dt, stepped, rush) {
    if (!ctx || !wanted) return;
    clock += dt;
    const now = ctx.currentTime;
    const presence = 1 - smoothstep(0.97, 1, u);
    master.gain.setTargetAtTime(presence, now, 0.4);

    const root = 52 * 0.55 ** u;
    body.osc.frequency.setTargetAtTime(Math.max(34, root), now, 0.18);
    const interval = u < 0.24 ? 1.5 : u < 0.46 ? 1.189 : u < 0.7 ? 1.498 : 1.25;
    fifth.osc.frequency.setTargetAtTime(Math.max(40, root * interval), now, 0.2);
    body.gain.gain.setTargetAtTime(0.055, now, 0.2);
    fifth.gain.gain.setTargetAtTime(0.022, now, 0.2);

    air.filter.frequency.setTargetAtTime(140 + (1 - u) * 260, now, 0.2);
    air.gain.gain.setTargetAtTime(0.028 * (1 - smoothstep(0.45, 0.92, u) * 0.55), now, 0.25);

    const orbit = smoothstep(0.5, 0.62, u) * (1 - smoothstep(0.96, 1, u));
    const beat = 0.5 + 0.5 * Math.sin(clock * (0.45 + u * 0.9));
    pulse.osc.frequency.setTargetAtTime(36 + orbit * 8, now, 0.2);
    pulse.gain.gain.setTargetAtTime(0.03 * orbit * (0.25 + beat), now, 0.08);
    const late = smoothstep(0.72, 0.82, u) * (1 - smoothstep(0.97, 1, u));
    veilTone.osc.frequency.setTargetAtTime(311 * 0.72 ** Math.max(0, u - 0.7), now, 0.3);
    veilTone.gain.gain.setTargetAtTime(0.018 * late, now, 0.3);

    if (stepped && u < 0.32 && rush < 2.2) foot();

    let next = -1;
    for (let i = 0; i < BELLS.length; i++) if (u >= BELLS[i]) next = i;
    if (next > stage && rush < 2.2) bell(NOTES[next]);
    stage = next;

    if (rush > 3.2 && clock - lastWhoosh > 1.1) {
      lastWhoosh = clock;
      whoosh();
    }
  }

  return {
    start,
    stop,
    unlock,
    update,
    get on() {
      return wanted;
    },
  };
}
