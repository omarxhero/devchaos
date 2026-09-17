# DevChaos — The 7 Dwarfs of Prompt Engineering

Pixel dwarfs live on your screen, hear what you type to your AI, grade your prompts,
roast you in gibberish — and a real gravitational-lens black hole eats your screen when
it's time to rest.

Built for the **Zaka LB FunChallenge 2026** (Functionality · Creativity · Fun · Demo).

![tests](https://github.com/omarxhero/devchaos/actions/workflows/ci.yml/badge.svg)

## What it does

- **7 dwarf personas, one fair scoring brain.** Doc teaches, Grumpy destroys, Happy hypes
  garbage, Sleepy owns the black hole, Sneezy sneezes on your prompt and grades the
  mangled remains, Bashful whispers his critique, Dopey answers the wrong question
  thrilled. The score is always the same deterministic engine — only the delivery changes.
- **🎧 IDE listener (the magic).** Toggle the headphones and the dwarf reacts to detected prompts
  you type to your real AI agent (VS Code, Zed, Cursor, ZCode, Claude Code, browser AI
  chats). Type once — the dwarf reacts automatically. Code lines, URLs and terminal
  commands are filtered; Shift+Enter stays inside the message. Opt-in with a visible
  indicator. Accepted prompts enter local session history; see the privacy notes below.
- **The black hole.** When your work timer expires (25 minutes on a fresh profile), a
  gravitational-lens shader over a capture of your real screen spawns at a random spot,
  grows, tumbles in 3D, devours the screen, then recedes while you rest.
- **Roastometer** — slide between WHOLESOME and SAVAGE to set the next roast's intensity.
  Full savage puts sunglasses on the dwarf.
- **Living creatures** — per-dwarf motion personalities, idle quips, AFK naps,
  storms-off-after-3-lazy-prompts (Dopey replaces Grumpy), mood meter (your prompt
  quality is his diet), drag-and-drop, Leaderboard of Shame.
- **Game-gibberish voice + 8-bit SFX** synthesized in Web Audio — zero audio files,
  zero TTS, works with the sound off.

## Quick start

```sh
npm install          # on CDN-blocked networks: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
npm start            # overlay appears, dwarf starts walking
```

Controls:

| Action | How |
| --- | --- |
| Toggle 🎧 IDE listening | the `🎧 IDE` chip (top-right) or **Ctrl+Alt+L** |
| Summon the black hole | the `☠` chip (top-right) |
| Switch dwarf | hat buttons (bottom-right) |
| Roastometer | slider inside the dialogue panel |
| Quit | **Ctrl+Alt+Q** or tray menu |

Settings live in `%APPDATA%/devchaos/config.json` (break length, demo mode, listen state).
API keys are pasted into the app's own settings — never into the repo.

## Demo mode

`npm run demo` — fast timings (8s hole growth) for rehearsals. The tray menu also has a
demo toggle and "Summon black hole".

## Architecture

```
src/main/       Electron main: overlay + break windows, tray, IPC, IDE listener host,
                gates (IDE window match + natural-language filter), config/session
src/renderer/   overlay UI (dwarf engine, dialogue panel, hats, hole canvas), break window,
                hole.js — the overlay-native black hole engine (transparent WebGL2 +
                alpha mask so the lens floats over your real work)
src/brain/      scorer.js (deterministic <100ms), personalities, canned roasts + Lebanese
                lines, memory/mood, LLM adapter (Gemini / DeepSeek, 12s timeout → canned)
src/audio/      blip-voice synth (per-dwarf waveforms), jsfxr SFX presets
src/shaders/    blackhole port (geodesic-traced, live disk inclination/roll uniforms)
tools/          art pipeline (cutout/classify), ide-listener.ps1 (keyboard hook),
                standalone shader rig
tests/          node:test suites (scorer calibration, banks, memory, gates)
```

Design spine: `PROMPT → scorer → {stamp, mood, memory, triggers} → dwarf state →
{bubble, voice} → LLM-or-canned roast → black hole → leaderboard` — one pipeline shared
by the manual bar and the IDE listener.

**Offline-first:** the demo survives dead WiFi. Rule scorer + canned roasts are local;
the LLM layer is an upgrade, not a dependency.

## Tests

```sh
npm test                 # scorer, content, cache, persistence, listener lifecycle, contracts
node src/main/gates.cjs  # IDE-window and natural-language gate unit checks
npm run test:listener    # Windows: compile hook class; synthetic context tests, no live capture
npm run test:smoke       # Electron installed: isolated profile, mocked provider, listener off
```

## Privacy (the honest version)

The listener is Windows-only and starts disabled on a fresh profile. Your listening
preference is restored on later launches. While enabled, the keyboard hook buffers
keystrokes globally in RAM; main applies the window and natural-language gates after
Enter. The buffer is discarded on foreground-window changes and observed title changes.
This is a heuristic, not a guarantee that every AI prompt is detected or every sensitive
field is excluded. Synthetic tests cover reset logic, not live Windows event delivery.

Accepted prompts enter the same local history as manually submitted prompts and are
persisted in `session.json` under Electron's user-data directory. Gate diagnostics omit
captured text and window metadata. Older logs from earlier versions are not scrubbed.
When an API key is configured, accepted prompts and a session summary may be sent to
the selected provider. Disable listening for sensitive work, or keep the app offline
without a key. Keys are stored in local plaintext configuration, not encrypted; the
settings UI masks saved keys and never returns their value to the renderer.

The screen capture used for the black hole is processed locally. Do not commit
user-data, session files, credentials, or diagnostic screenshots.

## Credits & licenses

MIT — see [LICENSE](LICENSE). The black hole shader core and window patterns are adapted
from **blackhole-timer** (MIT) / **ghostty-blackhole** (MIT); SFX from **jsfxr**
(public domain); vague-prompt regexes inspired by **Promptlinter** (MIT). Full texts in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md). Dwarf art generated by the author.
