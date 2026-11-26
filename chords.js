// Chord theory + detection engine. Works in the browser (window.Chords) and in Node (module.exports).
(function (root) {
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Default spelling: the most common names for each key.
  const MIXED = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SPELLINGS = { mixed: MIXED, sharp: SHARP, flat: FLAT };

  // Each chord: symbol suffix, full name, group, intervals in semitones from the root (may go above 12),
  // and "opt": intervals (mod 12) a player may leave out while the chord still counts.
  const P5 = 7;
  const CHORDS = [
    // Triads
    { s: '', n: 'major', g: 'Triads', i: [0, 4, 7] },
    { s: 'm', n: 'minor', g: 'Triads', i: [0, 3, 7] },
    { s: 'dim', n: 'diminished', g: 'Triads', i: [0, 3, 6] },
    { s: 'aug', n: 'augmented', g: 'Triads', i: [0, 4, 8] },
    { s: 'sus2', n: 'suspended 2nd', g: 'Triads', i: [0, 2, 7] },
    { s: 'sus4', n: 'suspended 4th', g: 'Triads', i: [0, 5, 7] },
    { s: '5', n: 'power chord', g: 'Triads', i: [0, 7] },
    { s: '(b5)', n: 'major flat 5', g: 'Triads', i: [0, 4, 6], rare: 1 },
    // Sixths
    { s: '6', n: 'major 6th', g: 'Sixths', i: [0, 4, 7, 9], opt: [P5] },
    { s: 'm6', n: 'minor 6th', g: 'Sixths', i: [0, 3, 7, 9] },
    { s: '6/9', n: 'six-nine', g: 'Sixths', i: [0, 4, 7, 9, 14], opt: [P5] },
    { s: 'm6/9', n: 'minor six-nine', g: 'Sixths', i: [0, 3, 7, 9, 14], opt: [P5] },
    // Sevenths
    { s: '7', n: 'dominant 7th', g: 'Sevenths', i: [0, 4, 7, 10], opt: [P5] },
    { s: 'maj7', n: 'major 7th', g: 'Sevenths', i: [0, 4, 7, 11], opt: [P5] },
    { s: 'm7', n: 'minor 7th', g: 'Sevenths', i: [0, 3, 7, 10], opt: [P5] },
    { s: 'm(maj7)', n: 'minor major 7th', g: 'Sevenths', i: [0, 3, 7, 11], opt: [P5] },
    { s: 'm7b5', n: 'half-diminished 7th', g: 'Sevenths', i: [0, 3, 6, 10] },
    { s: 'dim7', n: 'diminished 7th', g: 'Sevenths', i: [0, 3, 6, 9] },
    { s: 'aug7', n: 'augmented 7th', g: 'Sevenths', i: [0, 4, 8, 10] },
    { s: 'maj7#5', n: 'augmented major 7th', g: 'Sevenths', i: [0, 4, 8, 11] },
    { s: '7b5', n: 'dominant 7th flat 5', g: 'Sevenths', i: [0, 4, 6, 10] },
    { s: 'maj7b5', n: 'major 7th flat 5', g: 'Sevenths', i: [0, 4, 6, 11], rare: 0.5 },
    { s: '7sus4', n: 'dominant 7th sus4', g: 'Sevenths', i: [0, 5, 7, 10], opt: [P5] },
    { s: '7sus2', n: 'dominant 7th sus2', g: 'Sevenths', i: [0, 2, 7, 10], opt: [P5] },
    { s: 'maj7sus4', n: 'major 7th sus4', g: 'Sevenths', i: [0, 5, 7, 11], opt: [P5] },
    // Added-tone
    { s: 'add9', n: 'add 9', g: 'Added tones', i: [0, 4, 7, 14], opt: [P5] },
    { s: 'm(add9)', n: 'minor add 9', g: 'Added tones', i: [0, 3, 7, 14], opt: [P5] },
    { s: 'add11', n: 'add 11', g: 'Added tones', i: [0, 4, 7, 17], opt: [P5] },
    { s: 'm(add11)', n: 'minor add 11', g: 'Added tones', i: [0, 3, 7, 17], opt: [P5] },
    { s: 'add#11', n: 'add sharp 11', g: 'Added tones', i: [0, 4, 7, 18], opt: [P5], rare: 0.5 },
    { s: 'sus2sus4', n: 'sus2 sus4', g: 'Added tones', i: [0, 2, 5, 7], opt: [P5], rare: 0.5 },
    // Ninths
    { s: '9', n: 'dominant 9th', g: 'Ninths', i: [0, 4, 7, 10, 14], opt: [P5] },
    { s: 'maj9', n: 'major 9th', g: 'Ninths', i: [0, 4, 7, 11, 14], opt: [P5] },
    { s: 'm9', n: 'minor 9th', g: 'Ninths', i: [0, 3, 7, 10, 14], opt: [P5] },
    { s: 'm(maj9)', n: 'minor major 9th', g: 'Ninths', i: [0, 3, 7, 11, 14], opt: [P5] },
    { s: 'm9b5', n: 'half-diminished 9th', g: 'Ninths', i: [0, 3, 6, 10, 14] },
    { s: '9sus4', n: 'dominant 9th sus4', g: 'Ninths', i: [0, 5, 7, 10, 14], opt: [P5] },
    { s: '7b9', n: 'dominant 7th flat 9', g: 'Ninths', i: [0, 4, 7, 10, 13], opt: [P5] },
    { s: '7#9', n: 'dominant 7th sharp 9', g: 'Ninths', i: [0, 4, 7, 10, 15], opt: [P5] },
    { s: '9b5', n: 'dominant 9th flat 5', g: 'Ninths', i: [0, 4, 6, 10, 14] },
    { s: '9#5', n: 'dominant 9th sharp 5', g: 'Ninths', i: [0, 4, 8, 10, 14] },
    { s: '7b9b5', n: 'dominant 7th flat 9 flat 5', g: 'Ninths', i: [0, 4, 6, 10, 13] },
    { s: '7#9#5', n: 'dominant 7th sharp 9 sharp 5', g: 'Ninths', i: [0, 4, 8, 10, 15] },
    { s: '7b9#5', n: 'dominant 7th flat 9 sharp 5', g: 'Ninths', i: [0, 4, 8, 10, 13] },
    { s: '7#9b5', n: 'dominant 7th sharp 9 flat 5', g: 'Ninths', i: [0, 4, 6, 10, 15] },
    // Elevenths
    { s: '11', n: 'dominant 11th', g: 'Elevenths', i: [0, 4, 7, 10, 14, 17], opt: [P5, 2, 4] },
    { s: 'm11', n: 'minor 11th', g: 'Elevenths', i: [0, 3, 7, 10, 14, 17], opt: [P5, 2] },
    { s: 'maj11', n: 'major 11th', g: 'Elevenths', i: [0, 4, 7, 11, 14, 17], opt: [P5, 2] },
    { s: 'm(maj11)', n: 'minor major 11th', g: 'Elevenths', i: [0, 3, 7, 11, 14, 17], opt: [P5, 2] },
    { s: '7#11', n: 'dominant 7th sharp 11', g: 'Elevenths', i: [0, 4, 7, 10, 18], opt: [P5] },
    { s: '9#11', n: 'dominant 9th sharp 11', g: 'Elevenths', i: [0, 4, 7, 10, 14, 18], opt: [P5] },
    { s: 'maj7#11', n: 'major 7th sharp 11', g: 'Elevenths', i: [0, 4, 7, 11, 18], opt: [P5] },
    { s: 'maj9#11', n: 'major 9th sharp 11', g: 'Elevenths', i: [0, 4, 7, 11, 14, 18], opt: [P5] },
    { s: 'm7(add11)', n: 'minor 7th add 11', g: 'Elevenths', i: [0, 3, 7, 10, 17], opt: [P5] },
    // Thirteenths
    { s: '13', n: 'dominant 13th', g: 'Thirteenths', i: [0, 4, 7, 10, 14, 17, 21], opt: [P5, 2, 5] },
    { s: 'maj13', n: 'major 13th', g: 'Thirteenths', i: [0, 4, 7, 11, 14, 17, 21], opt: [P5, 2, 5] },
    { s: 'm13', n: 'minor 13th', g: 'Thirteenths', i: [0, 3, 7, 10, 14, 17, 21], opt: [P5, 2, 5] },
    { s: 'm(maj13)', n: 'minor major 13th', g: 'Thirteenths', i: [0, 3, 7, 11, 14, 17, 21], opt: [P5, 2, 5] },
    { s: '13sus4', n: 'dominant 13th sus4', g: 'Thirteenths', i: [0, 5, 7, 10, 14, 21], opt: [P5, 2] },
    { s: '13b9', n: 'dominant 13th flat 9', g: 'Thirteenths', i: [0, 4, 7, 10, 13, 21], opt: [P5] },
    { s: '13#9', n: 'dominant 13th sharp 9', g: 'Thirteenths', i: [0, 4, 7, 10, 15, 21], opt: [P5] },
    { s: '13#11', n: 'dominant 13th sharp 11', g: 'Thirteenths', i: [0, 4, 7, 10, 14, 18, 21], opt: [P5, 2] },
    { s: '7b13', n: 'dominant 7th flat 13', g: 'Thirteenths', i: [0, 4, 7, 10, 20], opt: [P5] },
    { s: '7alt', n: 'altered dominant', g: 'Thirteenths', i: [0, 4, 10, 13, 15, 20] },
  ];

  CHORDS.forEach((c, idx) => {
    c.id = idx;
    c.pcs = [...new Set(c.i.map((x) => x % 12))].sort((a, b) => a - b);
    c.optSet = new Set(c.opt || []);
    c.req = c.pcs.filter((p) => p === 0 || !c.optSet.has(p));
  });

  const INTERVAL_NAMES = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
    'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th'];
  const DEGREE = { 0: '1', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '11', 6: 'b5', 7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7',
    13: 'b9', 14: '9', 15: '#9', 17: '11', 18: '#11', 20: 'b13', 21: '13' };

  function noteName(pc, spelling = 'mixed') { return SPELLINGS[spelling][((pc % 12) + 12) % 12]; }
  function midiName(m, spelling) { return noteName(m % 12, spelling) + (Math.floor(m / 12) - 1); }

  // Solfège names for single notes (black keys with #).
  const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  function solfege(pc) { return SOLFEGE[((pc % 12) + 12) % 12]; }

  // Theory-correct spelling of a chord tone: the letter comes from the degree (3rd = 2 letters up, etc.),
  // so Ebm gives Gb (not F#) and E major gives G# (not Ab).
  const LETTERS = 'CDEFGAB';
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const STEPS = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6,
    13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 20: 5, 21: 5 };
  function spellInterval(rootPc, iv, spelling = 'mixed') {
    const rootName = noteName(rootPc, spelling);
    const li = (LETTERS.indexOf(rootName[0]) + STEPS[iv]) % 7;
    const target = (rootPc + iv) % 12;
    let diff = ((target - LETTER_PC[li]) % 12 + 12) % 12;
    if (diff > 6) diff -= 12;
    if (Math.abs(diff) > 1) return noteName(target, spelling); // avoid double sharps/flats
    return LETTERS[li] + (diff === 1 ? '#' : diff === -1 ? 'b' : '');
  }

  function inversionLabel(chord, bassInterval) {
    if (bassInterval === 0) return 'root position';
    const has = (p) => chord.pcs.includes(p);
    const pick = (...ps) => ps.find(has);
    const third = pick(4, 3) ?? (chord.s.includes('sus2') && !chord.s.includes('sus4') ? pick(2) : pick(5, 2));
    const fifth = pick(7, 6, 8);
    const seventh = chord.s.includes('dim7') ? 9 : pick(10, 11);
    if (bassInterval === third) return '1st inversion';
    if (bassInterval === fifth) return '2nd inversion';
    if (bassInterval === seventh) return '3rd inversion';
    return DEGREE[bassInterval] + ' in the bass';
  }

  // Core: pitch-class matching, independent of voicing/order/octave.
  // notes: array of MIDI numbers. Returns ranked candidates (best first).
  function detect(notes, spelling = 'mixed') {
    const uniq = [...new Set(notes)].sort((a, b) => a - b);
    if (uniq.length === 0) return { kind: 'none', candidates: [] };
    const bass = uniq[0] % 12;
    const pcs = [...new Set(uniq.map((n) => n % 12))];
    if (pcs.length === 1) return { kind: 'note', name: midiName(uniq[0], spelling), candidates: [] };

    const results = [];
    const tryMatch = (set, slashBass) => {
      for (const r of set) {
        const rel = new Set(set.map((p) => (p - r + 12) % 12));
        for (const c of CHORDS) {
          if (rel.size > c.pcs.length) continue;
          let ok = true;
          for (const p of rel) if (!c.pcs.includes(p)) { ok = false; break; }
          if (!ok) continue;
          for (const p of c.req) if (!rel.has(p)) { ok = false; break; }
          if (!ok) continue;
          const missing = c.pcs.length - rel.size;
          if (slashBass && missing > 0) continue; // slash chords need a complete upper chord
          const bassRel = (bass - r + 12) % 12;
          let score = missing * 1.2 + c.pcs.length * 0.15 + (c.rare || 0);
          if (slashBass) score += 1.3; // bass note outside the chord, e.g. C/D
          else if (bassRel !== 0) {
            // Inversion with a chord tone (3rd/5th/7th) in the bass is common; a tension (9/11/13) in the bass is rare.
            const iv = c.i.find((x) => x % 12 === bassRel);
            score += iv > 12 ? 2.6 : 0.9;
          }
          if (c.s === '5' && set.length === 2) score -= 0.3;
          results.push({ chord: c, root: r, bassRel, slashBass, missing, score, present: rel });
        }
      }
    };
    tryMatch(pcs, false);
    // Slash chord with a non-chord bass, e.g. C/D or D/C
    if (pcs.length >= 4) tryMatch(pcs.filter((p) => p !== bass), true);

    if (results.length === 0) {
      if (pcs.length === 2) {
        const iv = (pcs[1] - pcs[0] + 12) % 12;
        return { kind: 'interval', name: INTERVAL_NAMES[(((uniq[uniq.length - 1] - uniq[0]) % 12) + 12) % 12] || INTERVAL_NAMES[iv], candidates: [] };
      }
      return { kind: 'unknown', candidates: [] };
    }

    results.sort((a, b) => a.score - b.score);
    const seen = new Set();
    const candidates = [];
    for (const r of results) {
      const name = formatName(r, bass, spelling);
      if (seen.has(name)) continue;
      seen.add(name);
      candidates.push({ ...r, name, ...describe(r, bass, spelling) });
    }
    if (pcs.length === 2 && candidates[0].chord.s !== '5') {
      const iv = (((uniq[1] - uniq[0]) % 12) + 12) % 12;
      return { kind: 'interval', name: INTERVAL_NAMES[iv], candidates };
    }
    return { kind: 'chord', candidates };
  }

  function bassName(r, bass, spelling) {
    if (r.slashBass) return noteName(bass, spelling);
    return spellInterval(r.root, r.chord.i.find((x) => x % 12 === r.bassRel), spelling);
  }

  function formatName(r, bass, spelling) {
    const base = noteName(r.root, spelling) + r.chord.s;
    return r.bassRel === 0 && !r.slashBass ? base : base + '/' + bassName(r, bass, spelling);
  }

  // Name each played MIDI note using the detected chord's spelling.
  function spellNotes(notes, cand, spelling) {
    return notes.map((m) => {
      const rel = (m - cand.root + 120) % 12;
      const iv = cand.chord.i.find((x) => x % 12 === rel);
      const nm = iv == null ? noteName(m % 12, spelling) : spellInterval(cand.root, iv, spelling);
      // Octave number follows the letter (B#3 sounds as C4, Cb4 as B3).
      const oct = Math.floor(m / 12) - 1 + (nm.startsWith('B') && m % 12 === 0 ? -1 : 0) + (nm.startsWith('C') && m % 12 === 11 ? 1 : 0);
      return nm + oct;
    });
  }

  function describe(r, bass, spelling) {
    const full = noteName(r.root, spelling) + ' ' + r.chord.n;
    let inv;
    if (r.slashBass) inv = bassName(r, bass, spelling) + ' in the bass';
    else inv = inversionLabel(r.chord, r.bassRel);
    const omitted = r.chord.pcs.filter((p) => !r.present.has(p))
      .map((p) => DEGREE[r.chord.i.find((x) => x % 12 === p)]);
    return { fullName: full, inversion: inv, omitted };
  }

  function chordNotes(root, chord, octave = 4) {
    const base = 12 * (octave + 1) + root;
    return chord.i.map((x) => base + x);
  }

  const api = { CHORDS, SHARP, FLAT, MIXED, SPELLINGS, DEGREE, SOLFEGE, solfege, noteName, midiName, spellInterval, spellNotes, bassName, detect, chordNotes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chords = api;
})(typeof window !== 'undefined' ? window : globalThis);
