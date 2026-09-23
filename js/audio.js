// All sound is synthesized with Web Audio: engine, horn, impacts, splashes and ambience.
export function createAudio() {
  let ac = null, master = null, engine = null, noiseBuf = null, enabled = true, nextAmbient = 0;

  function init() {
    if (ac || !enabled) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned oscillators through a lowpass, plus intake noise
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3;
    const g = ac.createGain(); g.gain.value = 0;
    const o1 = ac.createOscillator(); o1.type = 'sawtooth';
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.detune.value = -1200;
    const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const ng = ac.createGain(); ng.gain.value = 0.05; const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900;
    o1.connect(lp); o2.connect(lp); n.connect(nf).connect(ng).connect(lp); lp.connect(g).connect(master);
    o1.start(); o2.start(); n.start();
    engine = { o1, o2, lp, g };
  }

  function env(node, peak, attack, decay) {
    const t = ac.currentTime; node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack); node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(freq, dur, type = 'sine', gain = 0.05, slideTo = null, delay = 0) {
    if (!ac || !enabled) return;
    setTimeout(() => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      o.connect(g).connect(master); env(g, gain, 0.01, dur); o.start(); o.stop(ac.currentTime + dur + 0.05);
    }, delay);
  }
  function noise(dur, freq, gain, type = 'lowpass') {
    if (!ac || !enabled) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); s.connect(f).connect(g).connect(master); env(g, gain, 0.005, dur); s.start(); s.stop(ac.currentTime + dur + 0.05);
  }

  return {
    init,
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = v;
      if (!v && ac) ac.suspend(); else if (v) { init(); ac?.resume(); }
    },
    update(speed, throttle, boost, night, dt) {
      if (!ac || !enabled || !engine) return;
      const t = ac.currentTime, sp = Math.abs(speed);
      const rpm = 38 + sp * 3.4 + (boost ? 26 : 0) + Math.max(0, throttle) * 12;
      engine.o1.frequency.setTargetAtTime(rpm, t, 0.08);
      engine.o2.frequency.setTargetAtTime(rpm, t, 0.08);
      engine.lp.frequency.setTargetAtTime(260 + sp * 22 + Math.abs(throttle) * 300, t, 0.1);
      engine.g.gain.setTargetAtTime(0.035 + Math.abs(throttle) * 0.05 + sp * 0.0012, t, 0.12);
      // ambience: birds by day, crickets at night
      nextAmbient -= dt;
      if (nextAmbient <= 0) {
        nextAmbient = 1.5 + Math.random() * 4;
        if (night > 0.6) for (let k = 0; k < 3; k++) tone(4200 + Math.random() * 300, 0.04, 'sine', 0.006, null, k * 70);
        else { const f = 1800 + Math.random() * 1600; tone(f, 0.09, 'sine', 0.012, f * 1.4); tone(f * 1.2, 0.07, 'sine', 0.009, f * 0.9, 120); }
      }
    },
    honk() { tone(392, 0.28, 'square', 0.06); tone(494, 0.28, 'square', 0.045); },
    chime() { tone(660, 0.18, 'sine', 0.05); tone(880, 0.22, 'sine', 0.04, null, 90); tone(1320, 0.3, 'sine', 0.03, null, 180); },
    click() { tone(900, 0.04, 'triangle', 0.03); },
    jump() { tone(240, 0.12, 'triangle', 0.04, 420); },
    impact(strength) { noise(0.18, 400, Math.min(0.35, 0.05 + strength * 0.02)); tone(90, 0.16, 'sine', Math.min(0.2, strength * 0.015)); },
    land(strength) { noise(0.12, 240, Math.min(0.25, strength * 0.02)); },
    splash() { noise(0.5, 1800, 0.12, 'highpass'); },
    checkpoint() { tone(990, 0.12, 'square', 0.035); tone(1320, 0.16, 'square', 0.03, null, 80); },
    portal() { tone(520, 0.25, 'sine', 0.05, 1040); }
  };
}
