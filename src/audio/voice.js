// Gibberish voice — Undertale/Animal Crossing style blips, pure Web Audio.
// Typewriter drives the voice: bubble reveals a char → calls blip(). Guaranteed sync.
// Per-dwarf signature: waveform, base frequency, pitch multiplier, speed, jitter.

"use strict";

const WAVEFORMS = { square: "square", sine: "sine", triangle: "triangle", sawtooth: "sawtooth" };

class BlipSynth {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
  }

  init() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      return true;
    } catch {
      return false;
    }
  }

  // Called by the typewriter for each revealed character (skip spaces/pauses handled inside).
  blip(char, config) {
    if (!this.init()) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const conf = config || {};
    const wave = WAVEFORMS[conf.waveform] || "square";
    const base = (conf.baseFreq || 420) * (conf.pitch || 1);
    const speed = conf.speed || 1;

    if (char === " ") return; // silence between words
    const isPunct = /[.!?]/.test(char);
    const isComma = /[,;:]/.test(char);
    const isCaps = /[A-Z]/.test(char);
    const isVowel = /[aeiouAEIOU]/.test(char);

    let freq = base * (1 + (Math.random() - 0.5) * (conf.jitter ?? 0.12));
    if (isVowel) freq *= 0.92;           // vowels drop a touch — vocalic feel
    if (isCaps) freq *= 1.35;            // CAPS = alarmed squeak
    if (isPunct) freq *= 0.6;            // full stop = low grunt
    if (isComma) freq *= 0.75;

    const dur = (isPunct ? 0.13 : isVowel ? 0.075 : 0.055) / speed;
    const gainPeak = (conf.gain ?? 0.9) * this.volume * (isPunct ? 1.15 : 1);

    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (isPunct) osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + dur); // downward grunt

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Dwarf configs already carry voice params; map personality → synth params.
  paramsFor(dwarf) {
    const v = dwarf.voice || {};
    return {
      waveform: v.waveform || "square",
      baseFreq: { grumpy: 180, sleepy: 240, dopey: 260, doc: 380, sneezy: 480, bashful: 520, happy: 640 }[dwarf.id] || 420,
      pitch: v.pitch || 1,
      speed: v.speed || 1,
      jitter: v.id === "dopey" ? 0.3 : v.id === "sneezy" ? 0.2 : 0.12,
      gain: v.gain || 0.9,
    };
  }
}

window.DEVCHAOS_VOICE = new BlipSynth();
