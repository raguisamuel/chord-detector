/* global Chords, PianoView */
// The recorded video: dark background, the note or chord name on top, and the keyboard lighting up.
// 1280x720 at 30 fps keeps phones smooth. Keys are read live every frame, so nothing is missed.
(function () {
  const W = 1280;
  const H = 720;
  const FPS = 30;

  function create(mode) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d', { alpha: false });
    let lo = 36;
    let hi = 96;
    let lastName = '';
    let changedAt = 0;

    function draw() {
      const now = performance.now();
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#111115');
      bg.addColorStop(1, '#1b1b21');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      const v = window.App.view || {};
      const parts = v.parts && v.parts.length ? v.parts : [{ text: '–', cls: '' }];
      const name = parts.map((p) => p.text).join('');
      if (name !== lastName) { lastName = name; changedAt = now; }
      const fade = Math.min(1, (now - changedAt) / 90);
      PianoView.drawChordName(g, parts, W / 2, 205, 150, (v.faded ? 0.35 : 1) * (0.25 + 0.75 * fade));

      g.globalAlpha = v.faded ? 0.35 : 1;
      g.textAlign = 'center';
      g.font = '400 26px "Segoe UI", Roboto, sans-serif';
      g.fillStyle = '#7d7b74';
      if (v.label) g.fillText(v.label, W / 2, 56);
      g.font = '400 30px "Segoe UI", Roboto, sans-serif';
      g.fillStyle = '#b8b6ad';
      if (v.sub) g.fillText(v.sub, W / 2, 255);
      const pills = v.faded ? [] : (v.pills || []);
      g.font = '600 22px "Segoe UI", Roboto, sans-serif';
      const pw = pills.map((p) => g.measureText(p).width + 26);
      let px = W / 2 - pw.reduce((a, b) => a + b + 10, -10) / 2;
      pills.forEach((p, i) => {
        PianoView.roundRect(g, px, 280, pw[i], 38, 8);
        g.fillStyle = '#24242a'; g.fill();
        g.lineWidth = 2; g.strokeStyle = i === 0 ? '#e86f24' : '#3b3b42'; g.stroke();
        g.fillStyle = '#f2f1ec';
        g.fillText(p, px + pw[i] / 2, 306);
        px += pw[i] + 10;
      });
      g.globalAlpha = 1;

      if (mode === 'voice') {
        g.textAlign = 'left';
        g.font = '600 20px "Segoe UI", Roboto, sans-serif';
        g.fillStyle = '#e24b4a';
        g.beginPath(); g.arc(44, 46, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9b9a93';
        g.fillText('Piano + voice', 60, 53);
      }

      const state = window.App.keyState();
      for (const m of [...state.pressed, ...state.ringing]) if (m < lo || m > hi) { lo = 21; hi = 108; }
      PianoView.drawKeyboard(g, { x: 24, y: 360, w: W - 48, h: H - 360 - 16 }, lo, hi, state, v.faded ? null : v.rootPc, 'mixed');
    }

    return { canvas, draw };
  }

  window.VideoView = {
    // A video stream of the drawn view; also redraws the instant a key changes.
    stream(r, mode) {
      const view = create(mode);
      view.draw();
      const timer = setInterval(view.draw, 1000 / FPS);
      const prev = window.App.onKeys;
      window.App.onKeys = () => { view.draw(); if (prev) prev(); };
      r.cleanup = () => { clearInterval(timer); window.App.onKeys = prev; };
      return view.canvas.captureStream(FPS);
    },
  };
})();
