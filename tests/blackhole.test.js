import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { configPatch } = require('../src/main/config-store.cjs');
const source = fs.readFileSync(new URL('../src/renderer/app.js', import.meta.url), 'utf8');

test('peak soft-edge footprint covers approximately 65% of a 16:9 screen', () => {
  const hole = fs.readFileSync(new URL('../src/renderer/hole.js', import.meta.url), 'utf8');
  const constants = hole.match(/const AREA_MIN = .*;[\s\S]*?const AREA_MAX = .*;/)[0];
  const radiusCode = hole.slice(hole.indexOf('function maskRadius('), hole.indexOf('function diskPose('));
  const c = { gl: { canvas: { width: 1920, height: 1080 } }, HOLE: { _seed: [0.2, 0.3] } };
  vm.runInNewContext(constants + radiusCode, c);
  for (const time of [0, 10, 100, 900]) {
    const radius = c.maskRadius(1) * 3.2;
    const [cx, cy] = c.centerFor(1, time);
    const aspect = 16 / 9;
    let area = 0;
    for (let y = 0; y < 10000; y++) {
      const halfWidth = Math.sqrt(Math.max(0, radius ** 2 - ((y + 0.5) / 10000 - cy) ** 2));
      area += Math.max(0, Math.min(aspect, cx * aspect + halfWidth) - Math.max(0, cx * aspect - halfWidth));
    }
    const fraction = area / 10000 / aspect;
    assert.ok(fraction > 0.62 && fraction < 0.68, String(fraction));
  }
});

test('renderer sends continuous eased growth matching the mask, without byte-sized steps', () => {
  const hole = fs.readFileSync(new URL('../src/renderer/hole.js', import.meta.url), 'utf8').replace(/export /g, '');
  const uniforms = {};
  const canvas = { width: 1920, height: 1080, clientWidth: 1920, clientHeight: 1080 };
  const probeGl = new Proxy({ canvas,
    uniform1f: (name, value) => { uniforms[name] = value; },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const c = { probeGl, window: { devicePixelRatio: 1 } };
  vm.runInNewContext(hole + `
    gl = probeGl; locations = new Proxy({}, {get: (_, key) => key});
    HOLE._seed = [0.5, 0.5]; HOLE._tumbleW = 0; HOLE._tumblePhase = 0;
    drawFallback = () => {};
  `, c);
  c.render(10000, 0.25);
  assert.equal(uniforms.progress, 0.125, 'shader must receive the same eased growth as the mask');
  const expectedRadius = (Math.sqrt(0.0045 * (16 / 9) / Math.PI) * 0.875 + Math.sqrt(1.17 * (16 / 9) / Math.PI) * 0.125) * 0.25;
  assert.ok(Math.abs(uniforms.holeMaskRadius - expectedRadius) < 1e-12);
  let previous = uniforms.progress;
  for (let frame = 1; frame <= 120; frame++) {
    c.render(10000 + frame * 1000 / 60, 0.25 + frame / (60 * 900));
    assert.ok(uniforms.progress > previous, 'every frame must grow even during a 15-minute half');
    assert.ok(uniforms.progress - previous < 0.0001);
    previous = uniforms.progress;
  }
  c.render(20000, 1);
  assert.equal(uniforms.progress, 1);
  c.render(20016, 1 - 1 / 600);
  assert.ok(1 - uniforms.progress < 0.00001, 'recession starts gently at the peak');
});

test('small hole drifts broadly and slowly without teleports, inside safe screen bounds', () => {
  const hole = fs.readFileSync(new URL('../src/renderer/hole.js', import.meta.url), 'utf8');
  const code = hole.slice(hole.indexOf('function centerFor('), hole.indexOf('function diskPose('));
  for (const seed of [[0.2, 0.22], [0.8, 0.78]]) {
    const c = { HOLE: { _seed: seed } };
    vm.runInNewContext(code, c);
    const points = [];
    let maxStep = 0;
    for (let frame = 0; frame <= 7200; frame++) {
      const point = c.centerFor(0.2, frame / 60);
      assert.ok(point.every(v => v >= 0.12 && v <= 0.88));
      if (points.length) maxStep = Math.max(maxStep, Math.hypot(point[0] - points.at(-1)[0], point[1] - points.at(-1)[1]));
      assert.ok(maxStep < 0.002);
      points.push(point);
    }
    assert.ok(maxStep * 60 > 0.02 && maxStep * 60 < 0.026, 'drift stays moderate in normalized screen coordinates');
    for (const axis of [0, 1]) {
      const values = points.map(p => p[axis]);
      assert.ok(Math.max(...values) - Math.min(...values) > 0.25, 'small hole should travel, not wobble in place');
    }
  }
});

test('long breaks keep visible continuous disk tilt and self rotation', () => {
  const hole = fs.readFileSync(new URL('../src/renderer/hole.js', import.meta.url), 'utf8').replace(/export /g, '');
  for (const seconds of [20, 1800, 7200]) {
    const c = { performance: { now: () => 0 }, requestAnimationFrame() {} };
    vm.runInNewContext(hole + `
      startHum = () => {}; startCapture = () => {};
      HOLE.ready = true;
      runHoleCycle({growSec: ${seconds / 2}, recedeSec: ${seconds / 2}});
      HOLE._tumblePhase = 0;
    `, c);
    const poses = Array.from({length: 2401}, (_, frame) => c.diskPose(frame / 60));
    const tilts = poses.map(p => p[0]);
    assert.ok(Math.max(...tilts) - Math.min(...tilts) > 1, 'long break must not freeze the 3D tilt');
    assert.ok(poses[600][1] - poses[0][1] > 2, 'disk rolls about its center');
    for (let frame = 1; frame < poses.length; frame++) {
      assert.ok(Math.abs(poses[frame][0] - poses[frame - 1][0]) < 0.005);
      assert.ok(poses[frame][1] > poses[frame - 1][1]);
    }
  }
});

test('break statistics count elapsed break time, not work interval or edited duration', () => {
  const code = source.slice(source.indexOf('function breakEnded()'), source.indexOf('function startClockWatch()'));
  const context = {
    window: { __breaking: true, __resetDeadline() {} },
    config: { demo: false, breakMinutes: 180, breakDurationMinutes: 60 },
    breakStartedAt: 1000, Date: { now: () => 1801000 },
    memoryState: { stats: { blackHoleMinutes: 2 } }, persistSession() {},
    dwarfEngine: { id: 'sleepy', setDwarf() {}, setState() {} },
    chatPush() {}, setTimeout() {}, showLeaderboard() {},
  };
  vm.runInNewContext(code + '; breakEnded();', context);
  assert.equal(context.memoryState.stats.blackHoleMinutes, 32);
  assert.equal(context.breakStartedAt, null);
  assert.equal(context.window.__breaking, false);
});

test('configured break has equal halves and duplicate triggers cannot restart it', () => {
  const code = source.slice(source.indexOf('function triggerBreak()'), source.indexOf('function breakEnded()'));
  for (const demo of [false, true]) {
    let calls = 0, options;
    const context = {
      window: {}, config: { demo, breakDurationMinutes: 30 }, breakStartedAt: null,
      hole: { runHoleCycle: (value) => { calls++; options = value; return true; } },
      dwarfEngine: { setDwarf() {}, setState() {} }, quip() {}, breakEnded() {},
    };
    vm.runInNewContext(code + '; triggerBreak(); triggerBreak();', context);
    assert.equal(calls, 1);
    assert.equal(options.growSec, demo ? 10 : 900);
    assert.equal(options.recedeSec, options.growSec);
    assert.ok(context.breakStartedAt > 0);
  }
});

test('black-hole settings validate durations and preserve existing work interval', () => {
  const base = { breakMinutes: 120 };
  assert.deepEqual(configPatch(base, { breakDurationMinutes: 30 }), { breakMinutes: 120, breakDurationMinutes: 30 });
  assert.equal(configPatch(base, { breakMinutes: 180 }).breakMinutes, 180);
  for (const value of [0, -1, 121, 1.5, NaN, Infinity, '30']) {
    assert.throws(() => configPatch(base, { breakDurationMinutes: value }), /Invalid settings/);
  }
});
