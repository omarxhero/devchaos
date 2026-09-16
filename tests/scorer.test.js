"use strict";

import test from "node:test";import assert from "node:assert";
import { analyze } from "../src/brain/scorer.js";
import * as memory from "../src/brain/memory.js";
import * as canned from "../src/brain/canned.js";
import { DWARFS } from "../src/brain/personalities.js";

test("empty prompt = worst grade", () => {
  const r = analyze("");
  assert.equal(r.score, 1);
  assert.equal(r.label, "PURE LAZINESS");
});

test("'fix it' gets destroyed", () => {
  const r = analyze("fix it");
  assert.ok(r.score <= 2, `score ${r.score}`);
  assert.equal(r.label, "PURE LAZINESS");
  assert.ok(r.issues.some((i) => i.type === "empty_request" || i.type === "vague_reference"));
});

test("'make it work please' is vague", () => {
  const r = analyze("make it work please");
  assert.ok(r.score <= 4, `score ${r.score}`);
});

test("known typo detected", () => {
  const r = analyze("can you please rewrite this functoin so it handles the null case in user records");
  assert.ok(r.typos.some((t) => t.word === "functoin"), JSON.stringify(r.typos));
});

test("specific prompt scores high", () => {
  const r = analyze(
    "Refactor calculateTotal() in cart.js (TypeScript) to handle null user input. " +
    "It currently throws when user.profile is null — see the stack trace in issue #341. " +
    "Constraints: keep the public API, add 3 unit tests, and avoid try/catch per the team style guide."
  );
  assert.ok(r.score >= 7, `score ${r.score} issues=${JSON.stringify(r.issues)}`);
});

test("ALL CAPS shouting penalized", () => {
  const r = analyze("PLEASE JUST MAKE THE LOGIN PAGE WORK SOMEWHERE IN THE APP");
  assert.ok(r.issues.some((i) => i.type === "all_caps" || i.type === "vague_reference"));
  assert.ok(r.score <= 4);
});

test("scores always within 1..10 and tiers consistent", () => {
  for (const p of ["", "x", "fix it", "hello", "explain step-by-step how quicksort works in Python with 3 examples",
    "WOW THIS IS GREAT", "the file is broken fix it please asap", "y".repeat(900)]) {
    const r = analyze(p);
    assert.ok(r.score >= 1 && r.score <= 10, `${p.slice(0, 20)} -> ${r.score}`);
    assert.ok(["savage", "medium", "mild"].includes(r.tier));
  }
});

test("memory: streaks, worst, mood decay", () => {
  const state = memory.create();
  memory.record(state, { text: "fix it", score: 2, tier: "savage", dwarf: "grumpy", vague: true });
  memory.record(state, { text: "fix this", score: 2, tier: "savage", dwarf: "grumpy", vague: true });
  memory.record(state, { text: "make it work", score: 2, tier: "savage", dwarf: "grumpy", vague: true });
  assert.equal(state.stats.vagueStreak, 3);
  assert.equal(state.stats.crashStreak, 3);
  assert.equal(state.stats.worstScore, 2);
  assert.ok(state.mood < 0.3, `mood ${state.mood}`);

  memory.record(state, { text: "solid detailed prompt with file.js and constraints", score: 9, tier: "mild", dwarf: "doc", vague: false });
  assert.equal(state.stats.vagueStreak, 0);
  assert.ok(state.mood > 0.3);

  const lb = memory.leaderboard(state);
  assert.equal(lb.roasts, 4);
  assert.equal(lb.favoriteDwarf, "grumpy");
});

test("canned bank: every dwarf has every tier + triggers resolve", () => {
  for (const id of Object.keys(DWARFS)) {
    for (const tier of ["savage", "medium", "mild"]) {
      const line = canned.pickRoast(id, tier);
      assert.ok(typeof line === "string" && line.length > 5, `${id}/${tier}`);
    }
  }
  const t = canned.pickTrigger("memory_callback", { worst: "fix it", avg: "3.2", trend: "worse" });
  assert.ok(t.length > 5 && !t.includes("{"));
});
