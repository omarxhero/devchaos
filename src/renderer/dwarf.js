// Dwarf engine: sprite element, patrol, states, drag. Placeholder CSS gnome if art missing.

"use strict";

import { get, ORDER } from "../brain/personalities.js";

const SPRITE_DIR = "../../assets/sprites/processed/";

class DwarfEngine {
  constructor() {
    this.el = document.getElementById("dwarf");
    this.inner = null;
    this.id = "grumpy";
    this.x = Math.floor(window.innerWidth * 0.3);
    this.dir = 1;
    this.state = "idle";
    this.stateUntil = 0;
    this.dragging = false;
    this.speedMul = 1;
    this.onStateChange = null;

    this._buildDom();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    this._wireDrag();
  }

  _buildDom() {
    this.el.innerHTML = `
      <div class="body">
        <div class="placeholder">
          <div class="hat"></div><div class="face"></div><div class="nose"></div><div class="beard"></div>
        </div>
        <div class="shades"></div>
        <div class="cans">🎧</div>
      </div>`;
    this.inner = this.el.querySelector(".body");
    this._applyArt(this.id);
  }

  _applyArt(id) {
    const dwarf = get(id);
    this.el.style.setProperty("--hat", dwarf.color);
    // Motion personality: bounce drives idle/walk amplitude, speed drives cadence.
    this.el.style.setProperty("--bobAmp", String(dwarf.motion.bounce));
    this.el.style.setProperty("--animRate", String(Math.max(0.4, dwarf.motion.speed)));
    const img = new Image();
    img.onload = () => {
      const ph = this.el.querySelector(".placeholder");
      if (ph) ph.classList.add("hidden");
      const old = this.el.querySelector("img.art");
      if (old) old.remove();
      img.className = "art";
      this.inner.prepend(img);
    };
    img.src = SPRITE_DIR + id + ".png"; // 404 → placeholder stays. Art swaps in hot.
  }

  stormOff(onGone) {
    // Dramatic exit: sprint to the nearest edge, poof out of existence.
    if (this._exiting) return;
    this._exiting = true;
    this._onGone = onGone;
    this.dir = this.x < window.innerWidth / 2 ? -1 : 1;
    this.dir > 0 ? this.faceRight() : this.faceLeft();
    this.setState("walk");
    this.el.classList.add("storming");
  }

  setDwarf(id, { poof = true } = {}) {
    if (poof) this.poof();
    this.id = id;
    this._applyArt(id);
    this.speedMul = get(id).motion.speed;
    if (window.DEVCHAOS_SFX) window.DEVCHAOS_SFX.play(poof ? "poof" : "blip", { volume: 0.5 });
  }

  poof() {
    // pixel puff particles
    const r = this.el.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const p = document.createElement("div");
      p.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;
        width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;
        background:#fff;opacity:0.9;z-index:49;pointer-events:none;
        transition:transform ${0.4 + Math.random() * 0.3}s ease-out, opacity 0.7s;`;
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
        p.style.opacity = "0";
      });
      setTimeout(() => p.remove(), 800);
    }
  }

  setState(state, { holdMs = 0 } = {}) {
    this.state = state;
    this.el.className = "";
    this.el.classList.add("st-" + state);
    if (state === "walk") this.el.classList.toggle("flip", this.dir < 0);
    if (holdMs) this.stateUntil = performance.now() + holdMs;
    if (this.onStateChange) this.onStateChange(state);
  }

  faceLeft() { this.el.classList.add("flip"); }
  faceRight() { this.el.classList.remove("flip"); }

  say(text, { lebanese = null } = {}) {
    // Delegate to global bubble (app.js owns typewriter + voice sync).
    if (window.__devchaosBubble) window.__devchaosBubble(text, lebanese, this);
  }

  _loop(now) {
    // state auto-return
    if (this.stateUntil && now > this.stateUntil) {
      this.stateUntil = 0;
      this.setState("idle");
    }

    if (this._exiting) {
      // storm-off sprint: 3.5x speed, no turning back, poof at the edge
      this.x += this.dir * 1.6 * (this.speedMul || 1) * 3.5;
      const edge = this.dir > 0 ? window.innerWidth - 40 : 40;
      if ((this.dir > 0 && this.x >= edge) || (this.dir < 0 && this.x <= edge)) {
        this._exiting = false;
        this.el.classList.remove("storming");
        this.poof();
        this.x = Math.floor(window.innerWidth * 0.3);
        this.el.style.left = this.x + "px";
        const gone = this._onGone;
        this._onGone = null;
        if (gone) gone();
        requestAnimationFrame(this._loop);
        return;
      }
    } else if (!this.dragging && this.state === "walk") {
      this.x += this.dir * 1.6 * this.speedMul;
      const margin = 90;
      if (this.x < margin) { this.x = margin; this.dir = 1; this.faceRight(); }
      if (this.x > window.innerWidth - margin) { this.x = window.innerWidth - margin; this.dir = -1; this.faceLeft(); }
      // random idle stops and turns
      if (Math.random() < 0.004) this.setState("idle", { holdMs: 1500 + Math.random() * 2500 });
      else if (Math.random() < 0.002) { this.dir *= -1; this.dir > 0 ? this.faceRight() : this.faceLeft(); }
    } else if (!this.dragging && this.state === "idle") {
      if (Math.random() < 0.0015) {
        this.setState("walk");
      }
    }

    this.el.style.left = this.x + "px";
    requestAnimationFrame(this._loop);
  }

  _wireDrag() {
    let offsetX = 0;
    const down = (e) => {
      this.dragging = true;
      const r = this.el.getBoundingClientRect();
      offsetX = e.screenX - r.left;
      this.el.style.cursor = "grabbing";
      if (window.devchaos) window.devchaos.passthrough(false);
    };
    const move = (e) => {
      if (!this.dragging) return;
      this.el.style.left = (e.screenX - offsetX) + "px";
      this.el.style.top = (e.screenY - 60) + "px";
      this.el.style.bottom = "auto";
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.style.cursor = "grab";
      // settle back to bottom band
      this.el.style.top = "auto";
      this.el.style.bottom = "6px";
      this.setState("victory", { holdMs: 1200 }); // dizzy celebration
      if (window.devchaos) window.devchaos.passthrough(true);
    };
    this.el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  rect() { return this.el.getBoundingClientRect(); }
}

window.DEVCHAOS_DWARF = new DwarfEngine();
export { DwarfEngine, ORDER };
