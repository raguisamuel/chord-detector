/* global Chords, Piano */
// Mobile Chord Detector: live note/chord detection (USB MIDI piano or touch keyboard) and the chord display.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const SPELL = 'mixed';
  const App = window.App = { onEvent: null, onChord: null, view: null, page: 'live' };
  const emit = (k, n, v) => { if (App.onEvent) App.onEvent(k, n, v); };

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  App.toast = toast;

  // Phones only allow sound after the first touch.
  const unlock = () => { Piano.resume(); };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    document.querySelectorAll('main.view').forEach((v) => { v.hidden = v.id !== 'view-' + t.dataset.view; });
    App.page = t.dataset.view;
    if (App.page === 'chords') libKb.rebuild(); else liveKb.rebuild();
  }));

  // ---------- Sound: the grand piano only (keeps the app small) ----------
  Piano.onStatus((msg) => { $('soundStatus').textContent = msg; });
  Piano.setInstrument('grand');

  // ---------- Touch keyboard ----------
  // Multi-touch: every finger is its own note, so chords work; sliding a finger glides across keys.
  function touchKeyboard(container, opts) {
    const keysBox = el('div', 'keys');
    container.appendChild(keysBox);
    const keyEls = new Map();
    let lo = 48;
    let hi = 72;
    const fingers = new Map(); // pointerId -> note

    function build() {
      keysBox.textContent = '';
      keyEls.clear();
      [lo, hi] = opts.range();
      let whites = 0;
      for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites++;
      const w = 100 / whites;
      let wi = 0;
      for (let m = lo; m <= hi; m++) {
        const black = BLACK.has(m % 12);
        const k = el('div', black ? 'bk' : 'wk');
        if (black) { k.style.left = (wi * w - w * 0.31) + '%'; k.style.width = (w * 0.62) + '%'; }
        else { k.style.left = (wi * w) + '%'; k.style.width = w + '%'; wi++; if (m % 12 === 0) k.textContent = 'C' + (m / 12 - 1); }
        k.dataset.midi = m;
        keysBox.appendChild(k);
        keyEls.set(m, k);
      }
      if (opts.onBuild) opts.onBuild(lo, hi);
      show(lastShown, lastRoot);
    }

    const noteAt = (x, y) => {
      const t = document.elementFromPoint(x, y);
      return t && t.dataset && t.dataset.midi ? Number(t.dataset.midi) : null;
    };
    container.addEventListener('pointerdown', (e) => {
      const n = noteAt(e.clientX, e.clientY);
      if (n == null) return;
      e.preventDefault();
      try { container.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      fingers.set(e.pointerId, n);
      opts.onKey(n, true);
    });
    container.addEventListener('pointermove', (e) => {
      if (!fingers.has(e.pointerId)) return;
      const n = noteAt(e.clientX, e.clientY);
      const prev = fingers.get(e.pointerId);
      if (n == null || n === prev) return;
      opts.onKey(prev, false);
      fingers.set(e.pointerId, n);
      opts.onKey(n, true);
    });
    const up = (e) => {
      if (!fingers.has(e.pointerId)) return;
      opts.onKey(fingers.get(e.pointerId), false);
      fingers.delete(e.pointerId);
    };
    container.addEventListener('pointerup', up);
    container.addEventListener('pointercancel', up);
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    let lastShown = [];
    let lastRoot = null;
    function show(notes, rootPc) {
      lastShown = notes; lastRoot = rootPc;
      const s = new Set(notes);
      keyEls.forEach((k, m) => {
        k.classList.toggle('hit', s.has(m));
        k.classList.toggle('root', rootPc != null && s.has(m) && m % 12 === rootPc);
      });
    }
    return { rebuild: build, show, range: () => [lo, hi] };
  }

  // How many octaves fit: bigger keys in landscape so they are easy to play.
  function octavesFor(container) {
    const w = container.clientWidth || window.innerWidth;
    const landscape = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    const minWhite = landscape ? 36 : 26;
    return Math.max(2, Math.min(4, Math.floor(w / (7 * minWhite))));
  }

  // ---------- Live detection ----------
  const held = new Set();
  const sustained = new Set();
  const touched = new Set();
  let pedalDown = false;
  let startC = store.get('startC', 48); // lowest C shown

  const liveKb = touchKeyboard($('liveKb'), {
    range: () => { const o = octavesFor($('liveKb')); return [startC, Math.min(108, startC + o * 12)]; },
    onBuild: (lo, hi) => { $('rangeLabel').textContent = Chords.midiName(lo, SPELL) + ' – ' + Chords.midiName(hi, SPELL); },
    onKey: (n, down) => {
      if (down && !touched.has(n)) { touched.add(n); Piano.noteOn(n, 95); emit('on', n, 95); }
      else if (!down && touched.has(n)) { touched.delete(n); Piano.noteOff(n); emit('off', n, 0); }
      schedule();
    },
  });
  const shiftOct = (d) => { startC = Math.max(24, Math.min(84, startC + 12 * d)); store.set('startC', startC); liveKb.rebuild(); };
  $('octDown').addEventListener('click', () => shiftOct(-1));
  $('octUp').addEventListener('click', () => shiftOct(1));
  let resizeT = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { liveKb.rebuild(); libKb.rebuild(); }, 120); });

  function sounding() {
    const s = new Set([...held, ...touched]);
    if (pedalDown) sustained.forEach((n) => s.add(n));
    return [...s].sort((a, b) => a - b);
  }
  App.keyState = () => {
    const pressed = new Set([...held, ...touched]);
    const ringing = new Set();
    if (pedalDown) sustained.forEach((n) => { if (!pressed.has(n)) ringing.add(n); });
    return { pressed, ringing, pedal: pedalDown };
  };

  // Show what is played right away on the keys; the name waits a moment so a chord isn't named note by note.
  let timer = null;
  let due = 0;
  let lastCount = 0;
  function schedule() {
    const notes = sounding();
    // keep MIDI notes visible: follow them with the keyboard
    const [lo, hi] = liveKb.range();
    const out = notes.find((n) => n < lo || n > hi);
    if (out != null && !touched.size) { startC = Math.max(24, Math.min(84, Math.floor(out / 12) * 12 - (out > hi ? 12 : 0))); liveKb.rebuild(); }
    liveKb.show(notes, null);
    if (App.onKeys) App.onKeys();
    const delay = notes.length >= lastCount ? 35 : 160;
    lastCount = notes.length;
    const want = performance.now() + delay;
    if (timer && due <= want) return;
    clearTimeout(timer);
    due = want;
    timer = setTimeout(() => { timer = null; render(sounding()); }, delay);
  }

  function chordNode(target, rootPc, suffix, bassName) {
    target.textContent = '';
    target.appendChild(document.createTextNode(Chords.noteName(rootPc, SPELL)));
    if (suffix) target.appendChild(el('span', 'suf', suffix));
    if (bassName) target.appendChild(el('span', 'bass', '/' + bassName));
  }

  let lastShownName = '';
  function render(notes) {
    const name = $('chordName');
    const r = Chords.detect(notes, SPELL);
    if (r.kind === 'none') {
      name.classList.add('faded');
      $('notePills').textContent = '';
      liveKb.show([], null);
      App.view = Object.assign({}, App.view, { notes: [], pills: [], faded: true });
      return;
    }
    name.classList.remove('faded');
    const names = r.kind === 'chord' ? Chords.spellNotes(notes, r.candidates[0], SPELL) : notes.map((n) => Chords.midiName(n, SPELL));
    const pills = $('notePills');
    pills.textContent = '';
    names.forEach((n, i) => pills.appendChild(el('span', 'pill' + (i === 0 ? ' bass' : ''), n)));
    let rootPc = null;
    if (r.kind === 'note') {
      $('kindLabel').textContent = 'Note';
      name.textContent = Chords.solfege(notes[0] % 12);
      $('chordFull').textContent = '';
      rootPc = notes[0] % 12;
    } else if (r.kind === 'interval' && (!r.candidates.length || notes.length === 2)) {
      $('kindLabel').textContent = 'Interval';
      name.textContent = Chords.solfege(notes[0] % 12) + ' – ' + Chords.solfege(notes[notes.length - 1] % 12);
      $('chordFull').textContent = r.name;
    } else if (r.kind === 'chord') {
      const best = r.candidates[0];
      rootPc = best.root;
      $('kindLabel').textContent = 'Chord';
      const slash = best.bassRel !== 0 || best.slashBass;
      chordNode(name, best.root, best.chord.s, slash ? Chords.bassName(best, notes[0] % 12, SPELL) : null);
      $('chordFull').textContent = best.fullName + ' · ' + best.inversion;
      if (best.name !== lastShownName) { lastShownName = best.name; if (App.onChord) App.onChord(best.name); }
    } else {
      $('kindLabel').textContent = 'Notes';
      name.textContent = '?';
      $('chordFull').textContent = '';
    }
    liveKb.show(notes, rootPc);
    App.view = {
      label: $('kindLabel').textContent,
      parts: [...name.childNodes].map((n) => ({ text: n.textContent, cls: n.className || '' })),
      sub: $('chordFull').textContent,
      pills: names,
      notes,
      rootPc,
      faded: false,
    };
  }

  // ---------- MIDI (USB piano through an OTG cable) ----------
  function onMidi(e) {
    const [st, d1, d2] = e.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) {
      held.add(d1); sustained.delete(d1);
      Piano.noteOn(d1, d2); emit('on', d1, d2);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      held.delete(d1);
      if (pedalDown) sustained.add(d1);
      Piano.noteOff(d1); emit('off', d1, 0);
    } else if (cmd === 0xb0 && d1 === 64) {
      const down = d2 >= 64;
      if (down === pedalDown) return;
      pedalDown = down;
      if (!pedalDown) sustained.clear();
      Piano.setSustain(pedalDown); emit('ped', 64, pedalDown ? 127 : 0);
    } else if (cmd === 0xb0 && (d1 === 123 || d1 === 120)) {
      held.clear(); sustained.clear(); Piano.allOff();
    } else return;
    schedule();
  }
  function refreshInputs(access) {
    const inputs = [...access.inputs.values()];
    inputs.forEach((inp) => { inp.onmidimessage = onMidi; });
    const connected = inputs.filter((i) => i.state === 'connected');
    $('midiDot').className = 'dot ' + (connected.length ? 'ok' : 'warn');
    $('midiStatus').textContent = connected.length
      ? 'Piano connected: ' + connected.map((i) => i.name).join(', ')
      : 'No piano connected. Plug it in with a USB OTG cable, or play on the keys below.';
  }
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      refreshInputs(access);
      access.onstatechange = () => { held.clear(); sustained.clear(); refreshInputs(access); schedule(); };
    }, () => {
      $('midiDot').className = 'dot warn';
      $('midiStatus').textContent = 'Piano access was blocked. Allow MIDI for this app, or play on the keys below.';
    });
  } else {
    $('midiDot').className = 'dot warn';
    $('midiStatus').textContent = 'This browser cannot read a MIDI piano. Use Chrome on Android, or play on the keys below.';
  }

  // ---------- Chords tab ----------
  const COMMON = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm6', 'add9', '9', 'm7b5', 'dim7'];
  let libRoot = 0;
  let libChord = 0;
  let showAll = false;
  const libKb = touchKeyboard($('libKb'), {
    range: () => { const o = octavesFor($('libKb')); return o >= 3 ? [48, 84] : [48, 72]; },
    onKey: (n, down) => { if (down) Piano.play([n]); },
  });

  function libNotes() {
    const c = Chords.CHORDS[libChord];
    let notes = Chords.chordNotes(libRoot, c, 3).sort((a, b) => a - b);
    const [, hi] = libKb.range();
    while (notes[notes.length - 1] > hi && notes[0] - 12 >= 36) notes = notes.map((n) => n - 12);
    return notes;
  }

  function drawLib() {
    const roots = $('roots');
    roots.textContent = '';
    for (let pc = 0; pc < 12; pc++) {
      const b = el('button', 'chip' + (pc === libRoot ? ' on' : ''), Chords.noteName(pc, SPELL));
      b.addEventListener('click', () => { libRoot = pc; drawLib(); Piano.play(libNotes()); });
      roots.appendChild(b);
    }
    const types = $('types');
    types.textContent = '';
    Chords.CHORDS.forEach((c) => {
      if (!showAll && !COMMON.includes(c.s)) return;
      const b = el('button', 'chip' + (c.id === libChord ? ' on' : ''), Chords.noteName(libRoot, SPELL) + c.s);
      b.addEventListener('click', () => { libChord = c.id; drawLib(); Piano.play(libNotes()); });
      types.appendChild(b);
    });
    $('moreTypes').textContent = showAll ? 'Fewer types ▴' : 'More types ▾';
    const c = Chords.CHORDS[libChord];
    chordNode($('libName'), libRoot, c.s, null);
    $('libNotes').textContent = c.i.map((iv) => Chords.solfege((libRoot + iv) % 12)).join(' · ') + '   (' + c.i.map((iv) => Chords.spellInterval(libRoot, iv, SPELL)).join(' ') + ')';
    libKb.show(libNotes(), libRoot);
  }
  $('moreTypes').addEventListener('click', () => { showAll = !showAll; drawLib(); });
  $('playBtn').addEventListener('click', () => Piano.play(libNotes()));
  $('arpBtn').addEventListener('click', () => Piano.play(libNotes(), true));

  liveKb.rebuild();
  libKb.rebuild();
  drawLib();
  render([]);
})();
