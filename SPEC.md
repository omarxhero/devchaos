# DevChaos — The 7 Dwarfs of Prompt Engineering

Zaka LB fun hackathon, Sep 14–17 2026. Pixel dwarfs live on your screen over your real
VS Code, roast your bad prompts, teach you good ones (Doc), and enforce rest breaks
with a slowly growing WebGL black hole (Sleepy).

## Status of this document

This is the original design sketch, not an exact description of the current build.
The accepted primary break effect is transparent and overlay-native, with no
"SLEEP. NOW." text overlay; the separate break window is a legacy fallback.
Voice uses per-character oscillator gibberish, not natural-language TTS.
The selected LLM provider has a 12-second timeout; providers do not auto-failover.
Current cache, privacy and verification behavior are documented in [README.md](README.md).
Do not rebuild obsolete sketch features below as if they were missing requirements.

## Spine

PROMPT → scorer → {stamp + mood + memory + triggers} → dwarf state → {bubble + voice}
→ LLM-or-canned → {roast + Doc box} → break daemon → break window → leaderboard.
One session store, one state machine. No orphan features.

## Windows

- **Overlay** — transparent, frameless, fullscreen, always-on-top, click-through
  (setIgnoreMouseEvents true + forward:true; UI islands toggle it off on hover).
  Dwarf layer, bubbles, prompt bar, hat switcher, Roastometer, mood meter, stamps.
- **Break window** — spawned at break time, opaque fullscreen. Owns shader growth,
  dwarf panic + spiral-suck, "SLEEP. NOW." countdown lockout, release. Hidden skip
  hatch = triple-click top-left corner.
- **Tray** — show/hide, force break, demo mode, settings (interval/provider/key/
  volume/voice), quit. Key lives in userData/config.json — never in repo.

## Dwarfs (one rig, 7 configs)

| Dwarf  | Job            | Behavior                                   | Voice        |
|--------|----------------|--------------------------------------------|--------------|
| Doc    | Teacher        | fair grade + refactored prompt + why       | measured mid |
| Grumpy | Roaster        | the only bully; patience decays per session| low grumble  |
| Happy  | Hype man       | praises garbage                            | high bouncy  |
| Sleepy | Break daemon   | barely grades; owns black hole; 2AM police | slow yawny   |
| Sneezy | Chaos          | sneezes ON prompt, grades the mangled text | nasal        |
| Bashful| Shy critic     | whispers, apologizes mid-roast             | tiny quiet   |
| Dopey  | Noob           | misunderstands, loves everything           | wobbly       |

Score always comes from the SAME deterministic brain — the dwarf changes only the
delivery. Roastometer slider (SAVAGE ↔ WHOLESOME) = tone dial orthogonal to behavior.

## Brain (src/brain — pure JS, node-testable)

- `scorer.js` — deterministic <100ms: length, vague-regex blacklist (Promptlinter
  port), ALL-CAPS, punctuation wall, typo detection, specificity bonuses. Labels:
  1–2 PURE LAZINESS · 3–4 SPAGHETTI THOUGHT · 5–6 MID · 7–8 SOLID · 9–10 PROMPT ENGINEER.
- `llm.js` — provider adapter: Gemini Flash primary (JSON mode), DeepSeek backup.
  5s timeout → canned. Demo cache = prompt-hash → response.
- `canned.js` — roast bank per dwarf × 3 tiers + trigger lines + Lebanese bubbles.
- `memory.js` — session.json: prompts, stats, vagueStreak, worst, perDwarf counts.
  Callbacks rule-based (offline-safe).
- `mood.js` — decaying score average → thriving/neutral/sick + tint.

## Audio (src/audio)

- VoiceAdapter interface: `animalese.js` (npm, pitch/speed per dwarf) and
  `blipsynth.js` (hand-rolled oscillator per-char blips). Swap = one line.
- `sfx.js` — jsfxr presets generated at runtime, zero audio files: boing, alarm,
  stamp, sneeze, whoosh, victory, munch, poof.

## Break sequence (constants demo-tunable)

Sleepy walks in → "ok... that's enough..." → hole spawns center, intensity ramps
(GROW_SEC 45s real / 8s demo) + gravity hum → dwarf panics → spiral-sucks in →
fade → "SLEEP. NOW." countdown (30s real / 10s demo) → jingle → release → overlay
returns + Leaderboard of Shame.

## Scripted personality triggers (rule-based only)

3 vague in a row → Grumpy storms off, Dopey takes over · score-crash → Happy summoned ·
2AM–5AM → Sleepy invasion (once/night) · Sneezy selected → sneeze scramble ·
AFK 3min → bored mutter → nap.

## Day plan

D1 core loop offline (checkpoint: paste "fix it" → stamp + roast + gibberish, no net).
D2 full cast + LLM + Roastometer + black hole + memory + mood + leaderboard.
D3 demo mode + script + 3 rehearsals + projector test + backup video + licenses.

## Cut order under time pressure (never cut the bold)

sunglasses → idle quips → drag → Sneezy scramble → Lebanese lines → mood tint.
**Never cut: black hole, 7 personalities, Roastometer, offline fallback, leaderboard.**

## Credits

Builds on MIT/public-domain prior art — see THIRD-PARTY-LICENSES: blackhole-timer
(Electron shell + shader), pixelpets (pet engine patterns), animalese-tts (voice),
jsfxr (SFX), Promptlinter (vague-prompt regexes), promptier (lint heuristics).
