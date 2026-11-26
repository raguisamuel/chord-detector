/* global Chords, Piano, VideoView */
// Recording on the phone. Two modes:
//   Piano only    : video of the dark piano view, sound = the app's instrument.
//   Piano + voice : same video, sound = the app's instrument + your voice from the phone's mic.
// After recording: Save video, or Copy notes (what was played, as text).
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const App = window.App;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const fmt = (ms) => {
    const s = Math.max(0, ms) / 1000;
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };

  // ---------- Mode ----------
  let mode = store.get('recMode', 'piano');
  function showMode() {
    document.querySelectorAll('#recMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('voiceNote').hidden = mode !== 'voice';
  }
  document.querySelectorAll('#recMode button').forEach((b) => b.addEventListener('click', () => {
    if (rec) return;
    mode = b.dataset.mode; store.set('recMode', mode); showMode();
  }));
  showMode();

  // ---------- Storage ----------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const q = indexedDB.open('chord-detector-mobile', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('takes', { keyPath: 'id' });
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
    }
    return dbp;
  }
  async function tx(m, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('takes', m);
      const r = fn(t.objectStore('takes'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  let takes = [];

  // ---------- Recording ----------
  let rec = null;
  let tick = null;
  const prevEvent = App.onEvent;
  App.onEvent = (k, n, v) => { if (prevEvent) prevEvent(k, n, v); if (rec && rec.start) rec.events.push({ t: performance.now() - rec.start, k, n, v }); };
  const prevChord = App.onChord;
  App.onChord = (name) => { if (prevChord) prevChord(name); if (rec && rec.start) rec.chords.push({ t: performance.now() - rec.start, name }); };

  function pickMime() {
    const list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function startRec() {
    if (rec) return;
    Piano.resume();
    const r = rec = { start: 0, events: [], chords: [], chunks: [], mode, instrument: Piano.instrument() };
    $('recBtn').disabled = true;
    $('recHint').textContent = 'Starting…';
    try {
      const video = VideoView.stream(r, mode);
      if (mode === 'voice') {
        try {
          r.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
          const ctx = Piano.context();
          const src = ctx.createMediaStreamSource(r.mic);
          const gain = ctx.createGain();
          gain.gain.value = 1.2;
          src.connect(gain);
          r.detachMic = Piano.attachToRecording(gain); // voice goes into the recording only, never to the speaker
        } catch (e) {
          App.toast('Microphone not available, recording the piano only');
        }
      }
      const stream = new MediaStream([...video.getVideoTracks(), ...Piano.recordingStream().getAudioTracks()]);
      const mime = pickMime();
      const opts = { videoBitsPerSecond: 5000000, audioBitsPerSecond: 160000 };
      if (mime) opts.mimeType = mime;
      const mr = new MediaRecorder(stream, opts);
      mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
      mr.start(1000);
      r.mr = mr; r.mime = mr.mimeType || mime || 'video/webm';
    } catch (e) {
      App.toast('Video could not start on this phone');
    }
    r.start = performance.now();
    $('recBtn').disabled = false;
    $('recBtn').classList.add('on');
    $('recHint').textContent = 'Recording… tap to stop';
    tick = setInterval(() => { if (rec) $('recTime').textContent = fmt(performance.now() - rec.start); }, 250);
  }

  async function stopRec() {
    if (!rec || !rec.start) return;
    const r = rec;
    rec = null;
    clearInterval(tick);
    $('recBtn').classList.remove('on');
    $('recHint').textContent = 'Tap to record';
    $('recTime').textContent = '00:00';
    const duration = performance.now() - r.start;
    let video = null;
    if (r.mr) {
      await new Promise((res) => { r.mr.onstop = res; r.mr.stop(); });
      video = new Blob(r.chunks, { type: r.mime });
    }
    if (r.cleanup) r.cleanup();
    if (r.detachMic) r.detachMic();
    if (r.mic) r.mic.getTracks().forEach((t) => t.stop());
    if (!r.events.length && !video) return;
    const num = takes.reduce((m, t) => Math.max(m, t.num || 0), 0) + 1;
    const take = { id: Date.now(), num, name: 'Take ' + num, date: new Date().toISOString(), duration,
      events: r.events, chords: r.chords, video, videoType: r.mime || '', instrument: r.instrument, mode: r.mode };
    takes.unshift(take);
    try { await tx('readwrite', (s) => s.put(take)); } catch (e) { App.toast('Could not keep the recording on the phone'); }
    renderLast(take);
    renderList();
  }

  $('recBtn').addEventListener('click', () => (rec ? stopRec() : startRec()));

  // ---------- What was played, as text ----------
  // Single notes as Do Re Mi, chords as letters. Keys pressed while the earlier ones are still held (within
  // 150 ms) make one chord. A pause (all keys up for 0.6 s) starts a new line.
  function notesText(take) {
    const evs = take.events.slice().sort((a, b) => a.t - b.t);
    const ons = evs.filter((e) => e.k === 'on');
    const off = new Map();
    const open = new Map();
    evs.forEach((e) => {
      if (e.k === 'on') { if (!open.has(e.n)) open.set(e.n, []); open.get(e.n).push(e); }
      else if (e.k === 'off' && open.has(e.n) && open.get(e.n).length) off.set(open.get(e.n).shift(), e.t);
    });
    const groups = [];
    ons.forEach((e) => {
      const g = groups[groups.length - 1];
      const together = g && e.t - g.last <= 150 && g.ons.every((o) => (off.get(o) ?? Infinity) > e.t);
      if (together) { g.notes.push(e.n); g.ons.push(e); g.last = e.t; } else groups.push({ t: e.t, last: e.t, notes: [e.n], ons: [e] });
    });
    const lineStarts = new Set();
    const down = new Set();
    let silentSince = -Infinity;
    evs.filter((e) => e.k === 'on' || e.k === 'off').forEach((e) => {
      if (e.k === 'on') { if (down.size === 0 && e.t - silentSince >= 600) lineStarts.add(e.t); down.add(e.n); }
      else { down.delete(e.n); if (down.size === 0) silentSince = e.t; }
    });
    const lines = [];
    groups.forEach((g) => {
      const notes = [...new Set(g.notes)].sort((a, b) => a - b);
      let text = notes.map((n) => Chords.solfege(n % 12)).join(' + ');
      if (new Set(notes.map((n) => n % 12)).size >= 3) {
        const r = Chords.detect(notes, 'mixed');
        if (r.kind === 'chord') text = r.candidates[0].name;
      }
      if (lineStarts.has(g.t) || !lines.length) lines.push([]);
      lines[lines.length - 1].push(text);
    });
    return lines.map((l) => l.join('  ')).join('\n');
  }

  async function copyNotes(take) {
    const text = notesText(take);
    if (!text) { App.toast('Nothing was played'); return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = el('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      ta.remove();
    }
    App.toast('Notes copied');
  }

  const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'take';
  function videoFile(take) {
    const ext = /mp4/.test(take.videoType) ? '.mp4' : '.webm';
    return safe(take.name + ' ' + take.date.slice(0, 16).replace('T', ' ').replace(':', '-')) + ext;
  }
  function saveVideo(take) {
    if (!take.video) { App.toast('This recording has no video'); return; }
    const url = URL.createObjectURL(take.video);
    const a = el('a');
    a.href = url; a.download = videoFile(take);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    App.toast('Video saved to Downloads');
  }
  async function shareVideo(take) {
    try {
      const file = new File([take.video], videoFile(take), { type: take.video.type.split(';')[0] });
      await navigator.share({ files: [file], title: take.name });
    } catch (e) { /* cancelled */ }
  }
  const canShare = (take) => {
    try { return !!(take.video && navigator.canShare && navigator.canShare({ files: [new File([take.video], 'v.mp4', { type: take.video.type.split(';')[0] })] })); } catch (e) { return false; }
  };

  function buttons(take, box) {
    const row = el('div', 'take-btns');
    const b1 = el('button', 'btn primary', 'Save video');
    b1.addEventListener('click', () => saveVideo(take));
    const b2 = el('button', 'btn', 'Copy notes');
    b2.addEventListener('click', () => copyNotes(take));
    row.append(b1, b2);
    if (canShare(take)) {
      const b3 = el('button', 'btn icon', '↗');
      b3.title = 'Share';
      b3.setAttribute('aria-label', 'Share video');
      b3.addEventListener('click', () => shareVideo(take));
      row.appendChild(b3);
    }
    box.appendChild(row);
    return row;
  }

  function renderLast(take) {
    const box = $('lastTake');
    box.textContent = '';
    box.appendChild(el('div', 'card-title', 'Recording saved'));
    const head = el('div', 'take-head');
    head.append(el('span', 'take-name', take.name), el('span', 'take-meta', fmt(take.duration) + ' · ' + (take.mode === 'voice' ? 'Piano + voice' : 'Piano only')));
    box.appendChild(head);
    buttons(take, box);
    const text = notesText(take);
    if (text) box.appendChild(el('div', 'notes-text', text));
    box.hidden = false;
  }

  function renderList() {
    const list = $('takeList');
    list.textContent = '';
    if (!takes.length) { list.appendChild(el('div', 'empty', 'Your recordings will show here.')); return; }
    takes.forEach((take) => {
      const row = el('div', 'take');
      const head = el('div', 'take-head');
      head.append(el('span', 'take-name', take.name), el('span', 'take-meta', new Date(take.date).toLocaleString() + ' · ' + fmt(take.duration)));
      row.appendChild(head);
      const btns = buttons(take, row);
      const del = el('button', 'btn icon danger', '✕');
      del.setAttribute('aria-label', 'Delete recording');
      del.addEventListener('click', async () => {
        if (!window.confirm('Delete "' + take.name + '"? This can\'t be undone.')) return;
        takes = takes.filter((t) => t !== take);
        await tx('readwrite', (s) => s.delete(take.id)).catch(() => {});
        if (!$('lastTake').hidden && $('lastTake').querySelector('.take-name') && $('lastTake').querySelector('.take-name').textContent === take.name) $('lastTake').hidden = true;
        renderList();
      });
      btns.appendChild(del);
      list.appendChild(row);
    });
  }

  tx('readonly', (s) => s.getAll()).then((all) => {
    takes = (all || []).sort((a, b) => b.id - a.id);
    renderList();
  }).catch(() => renderList());

  window.Recorder = { notesText, start: startRec, stop: stopRec, takes: () => takes };
})();
