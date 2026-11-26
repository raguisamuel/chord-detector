/* global Chords */
// "Piano view" video: the app draws its own Full HD frames (chord name, notes, keyboard)
// and records them. Keys come straight from the live key state on every frame, so every
// key you press shows up with no delay; the chord name uses the detector's result.
// drawKeyboard / drawChordName are shared with the Studio split-screen video.
(function () {
  const W = 1920;
  const H = 1080;
  const FPS = 60;
  const BLACK = new Set([1, 3, 6, 8, 10]);
  // Black keys sit slightly off-center on a real piano.
  const BLACK_SHIFT = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
  const RANGES = { 49: [48, 96], 61: [36, 96], 76: [28, 103], 88: [21, 108] };
  const DEFAULT_PALETTE = { key: ['#7fb2f7', '#3d7fe0'], root: ['#ffab6e', '#e86f24'] };

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  function roundRect(g, x, y, w, h, rTop, rBottom = rTop) {
    g.beginPath();
    g.moveTo(x + rTop, y);
    g.lineTo(x + w - rTop, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rTop);
    g.lineTo(x + w, y + h - rBottom);
    g.quadraticCurveTo(x + w, y + h, x + w - rBottom, y + h);
    g.lineTo(x + rBottom, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rBottom);
    g.lineTo(x, y + rTop);
    g.quadraticCurveTo(x, y, x + rTop, y);
    g.closePath();
  }

  // Realistic keyboard inside rect {x, y, w, h}; keys stay in real proportions and sit at the bottom of the rect.
  function drawKeyboard(g, rect, lo, hi, state, rootPc, spelling, palette = DEFAULT_PALETTE) {
    let whites = 0;
    for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites++;
    const pad = Math.max(10, rect.w * 0.01);
    const margin = rect.x + pad;
    const width = rect.w - pad * 2;
    const ww = width / whites;
    const kh = Math.min(ww * 5.6, rect.h - 52);
    const top = rect.y + rect.h - kh - 18;
    const colorFor = (m) => (rootPc != null && m % 12 === rootPc ? palette.root : palette.key);
    const label = (m) => Chords.midiName(m, spelling);
    const pressed = state.pressed;
    const ringing = state.ringing || new Set();

    roundRect(g, margin - 12, top - 36, width + 24, kh + 50, 12);
    g.fillStyle = '#060608'; g.fill();
    g.fillStyle = '#7e1c28';
    g.fillRect(margin, top - 10, width, 10);

    const lights = new Map();
    let wi = 0;
    const blacks = [];
    for (let m = lo; m <= hi; m++) {
      if (BLACK.has(m % 12)) { blacks.push([m, wi]); continue; }
      const x = margin + wi * ww;
      const on = pressed.has(m);
      const ring = !on && ringing.has(m);
      const dy = on ? Math.max(2, kh * 0.018) : 0;
      roundRect(g, x + 1, top + dy, ww - 2, kh - dy, 0, Math.min(8, ww * 0.18));
      const gr = g.createLinearGradient(0, top, 0, top + kh);
      if (on || ring) {
        const [c1, c2] = colorFor(m);
        const t = ring ? 0.55 : 0;
        gr.addColorStop(0, mix(c2, '#f4f3ee', t));
        gr.addColorStop(1, mix(c1, '#f4f3ee', t));
      } else {
        gr.addColorStop(0, '#dddcd6');
        gr.addColorStop(0.12, '#f7f6f1');
        gr.addColorStop(0.92, '#fbfaf6');
        gr.addColorStop(1, '#d6d5cf');
      }
      g.fillStyle = gr; g.fill();
      g.lineWidth = 1.2; g.strokeStyle = '#7a7973'; g.stroke();
      g.textAlign = 'center';
      if (on || ring) {
        lights.set(m, [x + ww / 2, ring]);
        if (ww >= 16) {
          g.fillStyle = on ? '#0c2a55' : '#3a4a60';
          g.font = '600 ' + Math.round(Math.min(26, ww * 0.42)) + 'px "Segoe UI", sans-serif';
          g.fillText(label(m), x + ww / 2, top + kh - Math.min(16, kh * 0.07));
        }
      } else if (m % 12 === 0 && ww >= 14) {
        g.fillStyle = '#9a9891';
        g.font = '400 ' + Math.round(Math.min(18, ww * 0.34)) + 'px "Segoe UI", sans-serif';
        g.fillText('C' + (m / 12 - 1), x + ww / 2, top + kh - Math.min(14, kh * 0.06));
      }
      wi++;
    }

    const sh = g.createLinearGradient(0, top, 0, top + 22);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(margin, top, width, 22);

    const bw = ww * 0.58;
    const bh = kh * 0.63;
    blacks.forEach(([m, i]) => {
      const cx = margin + i * ww + (BLACK_SHIFT[m % 12] || 0) * ww;
      const x = cx - bw / 2;
      const on = pressed.has(m);
      const ring = !on && ringing.has(m);
      const dy = on ? Math.max(1.5, kh * 0.012) : 0;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 3, top, bw, bh + 6);
      roundRect(g, x, top + dy, bw, bh - dy, 0, 4);
      const gr = g.createLinearGradient(0, top, 0, top + bh);
      if (on || ring) {
        const [c1, c2] = colorFor(m);
        const t = ring ? 0.45 : 0;
        gr.addColorStop(0, mix(c2, '#1a1a1e', t));
        gr.addColorStop(1, mix(c1, '#1a1a1e', t));
      } else {
        gr.addColorStop(0, '#1b1b1e');
        gr.addColorStop(0.85, '#2e2e33');
        gr.addColorStop(1, '#0d0d0f');
      }
      g.fillStyle = gr; g.fill();
      if (!on && !ring) {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + bw * 0.14, top + 4, bw * 0.72, bh * 0.82);
      } else {
        lights.set(m, [cx, ring]);
        if (bw >= 12) {
          g.fillStyle = '#ffffff';
          g.font = '600 ' + Math.round(Math.min(18, bw * 0.4)) + 'px "Segoe UI", sans-serif';
          g.textAlign = 'center';
          g.fillText(label(m), cx, top + bh - 10);
        }
      }
    });

    lights.forEach(([x, ring], m) => {
      g.fillStyle = ring ? 'rgba(127,178,247,0.45)' : colorFor(m)[0];
      roundRect(g, x - ww * 0.32, top - 28, ww * 0.64, 7, 3.5);
      g.fill();
    });
    return { top, kh };
  }

  // Chord name made of parts [{text, cls: '' | 'suf' | 'bass'}], centered at (cx, baseline).
  function drawChordName(g, parts, cx, baseline, size, alpha = 1) {
    const fonts = {
      '': '600 ' + size + 'px "Segoe UI", sans-serif',
      suf: '500 ' + Math.round(size * 0.56) + 'px "Segoe UI", sans-serif',
      bass: '500 ' + Math.round(size * 0.56) + 'px "Segoe UI", sans-serif',
    };
    g.globalAlpha = alpha;
    let total = 0;
    const widths = parts.map((p) => { g.font = fonts[p.cls] || fonts['']; const w = g.measureText(p.text).width; total += w; return w; });
    let x = cx - total / 2;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    parts.forEach((p, i) => {
      g.font = fonts[p.cls] || fonts[''];
      g.fillStyle = p.cls === 'bass' ? '#a9a8a1' : '#f6f5f0';
      g.fillText(p.text, x, baseline);
      x += widths[i];
    });
    g.globalAlpha = 1;
  }

  function create(keysSetting, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d', { alpha: false });
    let [lo, hi] = RANGES[keysSetting] || RANGES[61];
    let lastName = '';
    let nameChangedAt = 0;
    const cam = opts.camera || null;
    // With a camera: the camera sits top-right and the chord name is centered in the space to its left.
    const CAM = { x: W - 56 - 720, y: 44, w: 720, h: 405 };
    const CX = cam ? (56 + CAM.x - 40) / 2 : W / 2;

    function camera() {
      if (!cam) return;
      roundRect(g, CAM.x - 4, CAM.y - 4, CAM.w + 8, CAM.h + 8, 22);
      g.fillStyle = '#2a2a31'; g.fill();
      g.save();
      roundRect(g, CAM.x, CAM.y, CAM.w, CAM.h, 18);
      g.clip();
      g.fillStyle = '#000';
      g.fillRect(CAM.x, CAM.y, CAM.w, CAM.h);
      const vw = cam.videoWidth;
      const vh = cam.videoHeight;
      if (vw && vh && cam.readyState >= 2) {
        // cover-fit the camera picture into the box
        const s = Math.max(CAM.w / vw, CAM.h / vh);
        const dw = vw * s;
        const dh = vh * s;
        g.drawImage(cam, CAM.x + (CAM.w - dw) / 2, CAM.y + (CAM.h - dh) / 2, dw, dh);
      }
      g.restore();
      // small live dot
      g.beginPath(); g.arc(CAM.x + 26, CAM.y + 26, 8, 0, Math.PI * 2);
      g.fillStyle = '#e24b4a'; g.fill();
    }

    function header(now) {
      const v = (window.App && window.App.view) || {};
      const parts = v.parts && v.parts.length ? v.parts : [{ text: '–', cls: '' }];
      const name = parts.map((p) => p.text).join('');
      if (name !== lastName) { lastName = name; nameChangedAt = now; }
      const fadeIn = Math.min(1, (now - nameChangedAt) / 90);
      const alpha = (v.faded ? 0.35 : 1) * (0.25 + 0.75 * fadeIn);
      drawChordName(g, parts, CX, 330, cam ? 190 : 220, alpha);

      g.globalAlpha = v.faded ? 0.35 : 1;
      g.textAlign = 'center';
      g.font = '400 ' + (cam ? 38 : 44) + 'px "Segoe UI", sans-serif';
      g.fillStyle = '#b8b6ad';
      if (v.sub) g.fillText(v.sub, CX, 405);

      const pills = v.faded ? [] : (v.pills || []);
      g.font = '500 32px "Segoe UI", sans-serif';
      const pw = pills.map((p) => g.measureText(p).width + 36);
      let px = CX - pw.reduce((a, b) => a + b + 14, -14) / 2;
      pills.forEach((p, i) => {
        roundRect(g, px, 440, pw[i], 56, 10);
        g.fillStyle = '#24242a'; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = i === 0 ? '#e86f24' : '#3b3b42'; g.stroke();
        g.fillStyle = '#f2f1ec';
        g.fillText(p, px + pw[i] / 2, 479);
        px += pw[i] + 14;
      });
      g.globalAlpha = 1;

      g.font = '400 26px "Segoe UI", sans-serif';
      g.fillStyle = '#7d7b74';
      if (v.label) g.fillText(v.label, CX, 92);
    }

    function badges(state) {
      g.font = '500 26px "Segoe UI", sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      const parts = [];
      if (window.Metronome && window.Metronome.isRunning()) parts.push('♩ = ' + window.Metronome.bpm());
      const bp = window.Beats && window.Beats.position();
      if (bp) parts.push('Beat · ' + bp.name);
      if (parts.length) { g.fillStyle = '#9b9a93'; g.fillText(parts.join('    '), 60, 70); }
      if (bp) {
        for (let i = 0; i < Math.min(bp.beats, 12); i++) {
          g.beginPath();
          g.arc(60 + i * 26 + 8, 110, 8, 0, Math.PI * 2);
          if (i === bp.beat) { g.fillStyle = '#e24b4a'; g.fill(); } else { g.strokeStyle = '#55544f'; g.lineWidth = 2; g.stroke(); }
        }
      }
      if (state.pedal) {
        // top-right normally; under the camera when the camera is there
        const bx = cam ? CAM.x + CAM.w - 150 : W - 60 - 150;
        const by = cam ? CAM.y + CAM.h + 18 : 48;
        g.textAlign = 'center';
        roundRect(g, bx, by, 150, 44, 10);
        g.fillStyle = '#1d2a40'; g.fill();
        g.fillStyle = '#9cc3ff';
        g.fillText('Sustain', bx + 75, by + 23);
      }
      g.textBaseline = 'alphabetic';
    }

    function draw() {
      const now = performance.now();
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#111115');
      bg.addColorStop(1, '#1b1b21');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const state = window.App && window.App.keyState ? window.App.keyState() : { pressed: new Set(), ringing: new Set(), pedal: false };
      for (const m of [...state.pressed, ...state.ringing]) {
        if (m < lo || m > hi) { lo = 21; hi = 108; } // played outside the range: show all 88 keys
      }
      const v = (window.App && window.App.view) || {};
      const spelling = (document.getElementById('spelling') || {}).value || 'mixed';
      camera();
      header(now);
      badges(state);
      drawKeyboard(g, { x: 40, y: 560, w: W - 80, h: H - 560 - 30 }, lo, hi, state, v.faded ? null : v.rootPc, spelling);
    }

    return { canvas, draw };
  }

  window.PianoView = {
    W, H, FPS, BLACK,
    create,
    drawKeyboard,
    drawChordName,
    roundRect,
    // Returns a MediaStream of the drawn view; frames are drawn at 60 fps and also the instant a key changes.
    stream(r, keysSetting, opts) {
      const view = create(keysSetting, opts);
      view.draw();
      const timer = setInterval(view.draw, 1000 / FPS); // a timer keeps going when the window is in the background
      const prevOnKeys = window.App.onKeys;
      window.App.onKeys = () => { view.draw(); if (prevOnKeys) prevOnKeys(); };
      r.cleanup = () => { clearInterval(timer); window.App.onKeys = prevOnKeys; };
      return view.canvas.captureStream(FPS);
    },
  };
})();
