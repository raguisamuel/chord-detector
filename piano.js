// Sound engine: sampled and synthesized instruments, plus the metronome click.
// Everything the instruments play goes to one bus that feeds
// (1) the speakers, only if "Hear app sound" is on, and (2) the recording, always.
// The metronome goes to the speakers, and to the recording only when asked.
(function () {
  const S = (id, name, group, o = {}) => Object.assign({ id, name, group, kind: 'sample', release: 0.15 }, o);
  const SUSTAIN = { loop: true };
  const INSTRUMENTS = [
    S('grand', 'Grand piano (Salamander)', 'Pianos', { release: 0.13 }),
    S('concert', 'Concert grand', 'Pianos'),
    S('bright', 'Bright piano', 'Pianos'),
    S('honkytonk', 'Honky-tonk piano', 'Pianos'),
    S('egrand', 'Electric grand (CP-80)', 'Pianos'),
    S('rhodes', 'Rhodes electric piano', 'Electric pianos', { release: 0.2 }),
    S('dx', 'DX electric piano', 'Electric pianos', { release: 0.2 }),
    { id: 'epiano', name: 'FM electric piano', group: 'Electric pianos', kind: 'epiano', release: 0.25 },
    S('clavinet', 'Clavinet', 'Electric pianos', { release: 0.08 }),
    S('organ', 'Organ', 'Organ and accordion', { ...SUSTAIN, attack: 0.01, release: 0.08, gain: 0.7 }),
    S('accordion', 'Accordion', 'Organ and accordion', { ...SUSTAIN, attack: 0.02, release: 0.1 }),
    S('violin', 'Violin', 'Strings', { ...SUSTAIN, attack: 0.07, release: 0.35, gain: 0.9 }),
    S('cello', 'Cello', 'Strings', { ...SUSTAIN, attack: 0.08, release: 0.4, gain: 0.9 }),
    S('ensemble', 'String ensemble', 'Strings', { ...SUSTAIN, attack: 0.1, release: 0.45 }),
    S('synthstrings', 'Synth strings', 'Strings', { ...SUSTAIN, attack: 0.08, release: 0.4 }),
    S('trumpet', 'Trumpet', 'Brass and woodwinds', { ...SUSTAIN, attack: 0.03, release: 0.15 }),
    S('saxophone', 'Saxophone', 'Brass and woodwinds', { ...SUSTAIN, attack: 0.03, release: 0.15 }),
    S('clarinet', 'Clarinet', 'Brass and woodwinds', { ...SUSTAIN, attack: 0.03, release: 0.15 }),
    S('flute', 'Flute', 'Brass and woodwinds', { ...SUSTAIN, attack: 0.04, release: 0.18, gain: 0.8 }),
    { id: 'oud', name: 'Oud', group: 'Plucked', kind: 'pluck', release: 0.18 },
    { id: 'qanun', name: 'Qanun', group: 'Plucked', kind: 'pluck', release: 0.7 },
    S('guitar', 'Nylon guitar', 'Plucked', { release: 0.3, gain: 1.1 }),
    S('harp', 'Harp', 'Plucked', { release: 0.9 }),
    S('musicbox', 'Music box', 'Bells and mallets', { release: 0.8 }),
    S('vibraphone', 'Vibraphone', 'Bells and mallets', { release: 0.6 }),
    S('xylophone', 'Xylophone', 'Bells and mallets', { release: 0.5, gain: 0.9 }),
    S('choir', 'Choir aahs', 'Choir', { ...SUSTAIN, attack: 0.15, release: 0.5 }),
    S('oohs', 'Voice oohs', 'Choir', { ...SUSTAIN, attack: 0.15, release: 0.5 }),
    S('synthchoir', 'Synth choir', 'Choir', { ...SUSTAIN, attack: 0.12, release: 0.5 }),
    { id: 'pad', name: 'Analog pad', group: 'Synths', kind: 'pad', release: 0.9 },
    S('warmpad', 'Warm pad', 'Synths', { ...SUSTAIN, attack: 0.2, release: 0.8 }),
    S('polysynth', 'Polysynth', 'Synths', { ...SUSTAIN, attack: 0.01, release: 0.35 }),
    S('halo', 'Halo pad', 'Synths', { ...SUSTAIN, attack: 0.25, release: 0.9 }),
    S('squarelead', 'Square lead', 'Synths', { ...SUSTAIN, attack: 0.005, release: 0.1, gain: 0.7 }),
    S('sawlead', 'Saw lead', 'Synths', { ...SUSTAIN, attack: 0.005, release: 0.1, gain: 0.7 }),
  ];
  const byId = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

  let ctx = null;
  let master, monitor, recDest, metroBus, metroToRec;
  const live = new Map(); // midi -> voice
  const deferred = new Set(); // released while sustain pedal held
  let sustain = false;
  let monitorOn = true;
  let volume = 0.8;
  let current = byId.grand;
  let onStatus = () => {};

  // Raw base64 samples registered by sounds/*.js, decoded into AudioBuffers on demand.
  const raw = { grand: window.PIANO_SAMPLES || {} };
  const decoded = {}; // id -> Map(midi -> AudioBuffer)
  const loading = {}; // id -> Promise
  window.registerSound = (id, data) => { raw[id] = data; };

  function init() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;

    // Small room reverb from a generated impulse response.
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv.buffer = ir;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.12;
    master.connect(comp);
    master.connect(reverbSend); reverbSend.connect(conv); conv.connect(comp);

    monitor = ctx.createGain();
    monitor.gain.value = monitorOn ? 1 : 0;
    recDest = ctx.createMediaStreamDestination();
    comp.connect(monitor); monitor.connect(ctx.destination);
    comp.connect(recDest);

    metroBus = ctx.createGain();
    metroBus.connect(ctx.destination);
    metroToRec = ctx.createGain();
    metroToRec.gain.value = 0;
    metroBus.connect(metroToRec); metroToRec.connect(recDest);

    decode('grand');
    return ctx;
  }

  function resume() { init(); if (ctx.state === 'suspended') ctx.resume(); }

  function loadScript(id) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'sounds/' + id + '.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('missing sound file'));
      document.head.appendChild(s);
    });
  }

  function decode(id) {
    if (loading[id]) return loading[id];
    loading[id] = (async () => {
      if (!raw[id]) await loadScript(id);
      const map = new Map();
      await Promise.all(Object.keys(raw[id]).map(async (k) => {
        const bin = atob(raw[id][k]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        try { map.set(Number(k), await ctx.decodeAudioData(bytes.buffer)); } catch (e) { /* skip bad sample */ }
      }));
      decoded[id] = map;
      decoded[id].keys_ = [...map.keys()].sort((a, b) => a - b);
      delete raw[id]; // free the base64 copy
      return map;
    })();
    loading[id].catch(() => { delete loading[id]; });
    return loading[id];
  }

  function nearest(id, m) {
    const keys = decoded[id] && decoded[id].keys_;
    if (!keys || !keys.length) return null;
    let best = keys[0];
    for (const k of keys) if (Math.abs(k - m) < Math.abs(best - m)) best = k;
    return best;
  }

  // ---- Voices ----
  function sampleVoice(inst, m, vel, t, key) {
    const v = Math.max(0.05, vel / 127);
    const buf = decoded[inst.id].get(key);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (m - key) / 12);
    if (inst.loop && buf.duration > 1) {
      src.loop = true;
      src.loopStart = buf.duration * 0.35;
      src.loopEnd = buf.duration * 0.85;
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + 17000 * Math.pow(v, 2.2);
    lp.Q.value = 0.5;
    const out = ctx.createGain();
    const level = (inst.gain || 1) * (0.12 + Math.pow(v, 1.7));
    if (inst.attack) { out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(level, t + inst.attack); }
    else out.gain.value = level;
    src.connect(lp); lp.connect(out); out.connect(outNode);
    src.start(t);
    return { out, oscs: [src], ended: false, rel: inst.release };
  }

  // Rhodes-style FM electric piano.
  function epianoVoice(m, vel, t) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const v = Math.max(0.05, vel / 127);
    const pos = Math.min(1, Math.max(0, (m - 21) / 87));
    const dec = 4.5 * Math.pow(1 - pos, 1.3) + 0.8;
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * (0.6 + 2.4 * v), t);
    modGain.gain.setTargetAtTime(f * 0.15, t, 0.25);
    mod.connect(modGain); modGain.connect(car.frequency);
    const tine = ctx.createOscillator(); tine.type = 'sine'; tine.frequency.value = f * 7;
    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(0.05 * v, t); tineG.gain.setTargetAtTime(0, t, 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35 * (0.2 + v), t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, dec / 3);
    const out = ctx.createGain();
    car.connect(g); tine.connect(tineG); tineG.connect(out); g.connect(out); out.connect(outNode);
    const oscs = [car, mod, tine];
    oscs.forEach((o) => { o.start(t); o.stop(t + dec * 3 + 0.5); });
    return { out, oscs, ended: false, rel: byId.epiano.release };
  }

  // Warm synth pad: detuned saws through a soft filter, holds while the key is down.
  function padVoice(m, vel, t) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const v = Math.max(0.05, vel / 127);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900 + 1400 * v; lp.Q.value = 0.8;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.09 * (0.4 + v), t + 0.35);
    lp.connect(out); out.connect(outNode);
    const oscs = [-8, 0, 8].map((cents) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      o.connect(lp); o.start(t); return o;
    });
    return { out, oscs, ended: false, rel: byId.pad.release };
  }

  // ---- Oud and qanun: physically modeled plucked strings (Karplus-Strong with exact tuning) ----
  // Oud: double courses, warm, short sustain. Qanun: triple courses, brighter, rings longer.
  const PLUCK = {
    oud: { strings: [-3.5, 3.5], dur: 3.2, t60Low: 2.4, t60High: 0.6, bright: 0.5, pick: 0.2,
      body: [['peaking', 170, 1.2, 5], ['peaking', 420, 1.4, 3], ['highshelf', 3200, 0.7, -5]] },
    qanun: { strings: [-2.5, 0, 2.5], dur: 4.2, t60Low: 4.2, t60High: 1.3, bright: 0.85, pick: 0.11,
      body: [['peaking', 320, 1.0, 3], ['peaking', 1400, 1.5, 2], ['highshelf', 4500, 0.7, 2]] },
  };
  const pluckCache = new Map();

  function renderPluck(kind, m) {
    const key = kind + m;
    if (pluckCache.has(key)) return pluckCache.get(key);
    const cfg = PLUCK[kind];
    const sr = ctx.sampleRate;
    const len = Math.floor(cfg.dur * sr);
    const out = new Float32Array(len);
    const pos = Math.min(1, Math.max(0, (m - 28) / 70));
    const t60 = cfg.t60Low * (1 - pos) + cfg.t60High * pos;
    for (const cents of cfg.strings) {
      const f = 440 * Math.pow(2, (m - 69) / 12 + cents / 1200);
      const p = sr / f - 0.5; // the averaging filter adds half a sample of delay
      const N = Math.floor(p);
      const frac = p - N;
      const C = (1 - frac) / (1 + frac); // allpass for the fractional part, so tuning is exact
      const g = Math.pow(10, -3 / (f * t60));
      const line = new Float32Array(N);
      let lp = 0;
      for (let i = 0; i < N; i++) { lp += cfg.bright * ((Math.random() * 2 - 1) - lp); line[i] = lp; }
      const P = Math.max(1, Math.round(N * cfg.pick)); // pluck position comb
      const ex = line.slice();
      let mean = 0;
      for (let i = 0; i < N; i++) { line[i] = ex[i] - (i >= P ? ex[i - P] : 0); mean += line[i]; }
      mean /= N;
      for (let i = 0; i < N; i++) line[i] -= mean;
      let idx = 0; let prev = 0; let apX = 0; let apY = 0;
      for (let n = 0; n < len; n++) {
        const cur = line[idx];
        const avg = g * 0.5 * (cur + prev);
        prev = cur;
        const y = C * avg + apX - C * apY;
        apX = avg; apY = y;
        line[idx] = y;
        out[n] += cur;
        if (++idx >= N) idx = 0;
      }
    }
    let peak = 0;
    for (let n = 0; n < len; n++) peak = Math.max(peak, Math.abs(out[n]));
    const k = peak > 0 ? 0.8 / peak : 1;
    for (let n = 0; n < len; n++) out[n] *= k;
    const buf = ctx.createBuffer(1, len, sr);
    buf.copyToChannel(out, 0);
    pluckCache.set(key, buf);
    return buf;
  }

  function pluckVoice(inst, m, vel, t) {
    const v = Math.max(0.05, vel / 127);
    const cfg = PLUCK[inst.id];
    const src = ctx.createBufferSource();
    src.buffer = renderPluck(inst.id, m);
    let node = src;
    cfg.body.forEach(([type, freq, q, gain]) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gain;
      node.connect(f); node = f;
    });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200 + 14000 * Math.pow(v, 2); lp.Q.value = 0.5;
    const out = ctx.createGain();
    out.gain.value = 0.15 + 0.9 * Math.pow(v, 1.6);
    node.connect(lp); lp.connect(out); out.connect(outNode);
    src.start(t);
    return { out, oscs: [src], ended: false, rel: inst.release };
  }

  // Where the voice being built connects to (the master bus, or a layer's own bus in the Studio).
  let outNode = null;

  function makeVoice(m, vel, t, instArg, dest) {
    const inst = instArg || current;
    outNode = dest || master;
    if (inst.kind === 'epiano') return epianoVoice(m, vel, t);
    if (inst.kind === 'pad') return padVoice(m, vel, t);
    if (inst.kind === 'pluck') return pluckVoice(inst, m, vel, t);
    const key = nearest(inst.id, m);
    if (key !== null) return sampleVoice(inst, m, vel, t, key);
    return epianoVoice(m, vel, t); // samples still loading
  }

  function release(voice, t) {
    if (!voice || voice.ended) return;
    voice.ended = true;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setValueAtTime(voice.out.gain.value, t);
    voice.out.gain.setTargetAtTime(0, t, voice.rel || 0.1);
    const stopAt = t + (voice.rel || 0.1) * 6 + 0.1;
    voice.oscs.forEach((o) => { try { o.stop(stopAt); } catch (e) { /* already stopped */ } });
  }

  const Piano = {
    INSTRUMENTS,
    resume,
    context() { resume(); return ctx; },
    instrument() { return current.id; },
    onStatus(fn) { onStatus = fn; },
    async setInstrument(id) {
      if (id === 'strings') id = 'ensemble'; // older saved setting
      const inst = byId[id] || byId.grand;
      current = inst;
      init();
      if (inst.kind === 'pluck') {
        // Pre-render the middle of the range so the first notes have no delay.
        onStatus('Preparing ' + inst.name + '…');
        await new Promise((r) => setTimeout(r, 0));
        for (let m = 48; m <= 84; m++) renderPluck(inst.id, m);
        onStatus('');
        return;
      }
      if (inst.kind !== 'sample') { onStatus(''); return; }
      if (decoded[inst.id]) { onStatus(''); return; }
      onStatus('Loading ' + inst.name + '…');
      try { await decode(inst.id); onStatus(''); } catch (e) { onStatus(inst.name + ' could not be loaded.'); }
    },
    noteOn(m, vel = 90) {
      resume();
      const t = ctx.currentTime;
      release(live.get(m), t);
      deferred.delete(m);
      live.set(m, makeVoice(m, vel, t));
    },
    noteOff(m) {
      if (!ctx) return;
      if (sustain) { deferred.add(m); return; }
      release(live.get(m), ctx.currentTime);
      live.delete(m);
    },
    setSustain(on) {
      sustain = on;
      if (!on && ctx) {
        deferred.forEach((m) => { release(live.get(m), ctx.currentTime); live.delete(m); });
        deferred.clear();
      }
    },
    allOff() {
      if (!ctx) return;
      live.forEach((v) => release(v, ctx.currentTime));
      live.clear(); deferred.clear();
    },
    // Fire-and-forget chord (library "Play" button).
    play(notes, arp) {
      resume();
      const now = ctx.currentTime + 0.02;
      notes.forEach((m, i) => {
        const t = now + (arp ? i * 0.18 : 0);
        const v = makeVoice(m, 85, t);
        release(v, t + (arp ? 2.2 - i * 0.1 : 1.8));
      });
    },
    // Scheduled note for playback of a recording; returns a cancel function.
    schedule(m, vel, startSec, durSec, instId) {
      resume();
      const t = ctx.currentTime + startSec;
      const v = makeVoice(m, vel, t, instId ? byId[instId] : null);
      release(v, t + Math.max(0.05, durSec));
      return () => release(v, ctx.currentTime);
    },
    // Studio: load an instrument without switching the live sound.
    async load(id) {
      const inst = byId[id] || byId.grand;
      init();
      if (inst.kind === 'pluck') { for (let m = 36; m <= 96; m++) renderPluck(inst.id, m); return; }
      if (inst.kind === 'sample' && !decoded[inst.id]) await decode(inst.id);
    },
    // Studio: note at an exact audio-clock time on a given instrument and bus; returns a cancel function.
    scheduleAt(m, vel, at, durSec, instId, dest) {
      resume();
      const v = makeVoice(m, vel, at, byId[instId] || current, dest);
      release(v, at + Math.max(0.05, durSec));
      return () => release(v, ctx.currentTime);
    },
    // A gain stage feeding the instrument bus (heard and recorded).
    createBus(gain = 1) {
      init();
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(master);
      return g;
    },
    instrumentName(id) { return (byId[id] || byId.grand).name; },
    // Metronome click at an exact audio time.
    click(t, accent, vol) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = accent ? 1760 : 1175;
      const g = ctx.createGain();
      const peak = Math.max(0.0001, vol * (accent ? 0.9 : 0.6));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(metroBus);
      o.start(t); o.stop(t + 0.08);
    },
    setMetronomeInRecording(on) { init(); metroToRec.gain.value = on ? 1 : 0; },
    recordingStream() { init(); return recDest.stream; },
    // Mix another source (the microphone) into the recording only, never into the speakers. Returns a detach function.
    attachToRecording(node) {
      init();
      node.connect(recDest);
      return () => { try { node.disconnect(recDest); } catch (e) { /* already detached */ } };
    },
    setMonitor(on) { monitorOn = on; if (monitor) monitor.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02); },
    setVolume(x) { volume = x; if (master) master.gain.setTargetAtTime(x, ctx.currentTime, 0.02); },
    samplesLoaded(id = 'grand') { return decoded[id] ? decoded[id].size : 0; },
  };
  window.Piano = Piano;
  init(); // start decoding the grand piano right away so the first note already sounds right
})();
