// Retro SFX via jsfxr (public domain). All sounds generated at runtime, zero audio files.
// Real API: jsfxr.Params preset methods + field overrides -> sfxr.toWebAudio(params, ctx).

"use strict";

// name -> [Params preset method, field overrides]
const PRESETS = {
  boing:   ["jump",       { p_base_freq: 0.5, p_freq_ramp: -0.6, p_env_sustain: 0.22, p_env_punch: 1.0 }],
  alarm:   ["alarm",      null], // alias handled below
  siren:   ["laserShoot", { p_base_freq: 0.7, p_freq_ramp: -0.2, p_env_sustain: 0.8, repeat: 0.5 }],
  stamp:   ["hitHurt",    { p_base_freq: 0.3, p_freq_ramp: -0.5, p_env_sustain: 0.12, p_env_punch: 1.0, p_env_decay: 0.2 }],
  sneeze:  ["explosion",  { p_base_freq: 0.8, p_freq_ramp: -0.8, p_env_sustain: 0.3, p_env_punch: 1.0, p_vib_strength: 0.4, p_vib_speed: 30 }],
  whoosh:  ["explosion",  { p_base_freq: 0.35, p_freq_ramp: -0.7, p_env_attack: 0.12, p_env_sustain: 0.35 }],
  victory: ["powerUp",    { p_base_freq: 0.35, p_freq_ramp: 0.5, p_env_sustain: 0.35, p_arp_speed: 0.4 }],
  munch:   ["hitHurt",    { p_base_freq: 0.45, p_freq_ramp: -0.3, p_env_sustain: 0.09, p_env_punch: 1.0 }],
  poof:    ["explosion",  { p_base_freq: 0.9, p_freq_ramp: -1.0, p_env_sustain: 0.15, p_env_punch: 0.2, p_env_decay: 0.4 }],
  tick:    ["blipSelect", { p_base_freq: 0.9, p_env_sustain: 0.05 }],
  blip:    ["blipSelect", { p_base_freq: 0.8, p_env_sustain: 0.03, p_env_punch: 0.6 }],
};

class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.volume = 0.7;
    this._lib = null;
  }

  async init() {
    if (this.ctx && this._lib) return;
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (!this._lib) {
      const mod = await import("../../node_modules/jsfxr/sfxr.mjs");
      this._lib = { Params: mod.jsfxr.Params, sfxr: mod.sfxr };
    }
  }

  async ensure(name) {
    await this.init();
    if (this.buffers.has(name)) return this.buffers.get(name);
    const [method, overrides] = PRESETS[name] || PRESETS.blip;
    const params = new this._lib.Params();
    if (typeof params[method] === "function") params[method]();
    else params.blipSelect();
    if (overrides) Object.assign(params, overrides);
    params.sound_vol = 0.5;
    const buffer = this._lib.sfxr.toWebAudio(params, this.ctx);
    this.buffers.set(name, buffer);
    return buffer;
  }

  async play(name, { volume = 1, rate = 1 } = {}) {
    try {
      const buffer = await this.ensure(name);
      if (this.ctx.state === "suspended") await this.ctx.resume();
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = volume * this.volume;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    } catch {
      // audio dead → comedy continues silently
    }
  }
}

window.DEVCHAOS_SFX = new Sfx();
