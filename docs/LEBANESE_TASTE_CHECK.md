# Lebanese Arabizi dialogue — candidate taste check

## Current behavior

The main dialogue language is Lebanese Arabizi, **not English with an occasional Lebanese phrase**.

- Model roast requests require the entire roast and optional verdict label in Lebanese Arabizi, including when input is English. Technical terms can remain English. This is a model instruction, not a runtime dialect detector.
- All seven dwarfs have Arabizi primary offline replies across all three tiers, plus translated idle quips, entrances, main-overlay status dialogue and triggers.
- The 21 secondary bubble lines are also Arabizi. Their existing 18% probability only controls the extra bubble line, not the main language.
- Copy-ready model rewrites and Doc ideas request clean English and explicit placeholders for unknown facts. Offline templates preserve the user's original text and append English instructions; they do not translate arbitrary input.
- Audio remains synthesized game-gibberish. No TTS was added.
- Only IDE input is graded; the exact original text is scored for every dwarf, including Sneezy. The manual box is ordinary Arabizi conversation with separate instructions, bounded per-dwarf history and simple offline replies, not canned roasts. It does not update prompt statistics or automatically rewrite messages.
- The scoring algorithm, motion, timers, listener behavior and approved overlay-native black-hole visuals were not redesigned.
- The legacy separate break-window fallback remains unchanged, including its old English text; it is not the accepted primary overlay experience.

The local dataset informed adapted vocabulary/style. It was not used to train or fine-tune a model, and is not loaded wholesale at runtime. The raw JSONL remains outside the repository and was not sent to the provider. Source IDs in `src/brain/lebanese.js` trace nine vocabulary entries, not authorship of the newly written jokes. Dataset provenance/licensing and native authenticity are not comprehensively audited.

## Offline candidates from the actual bank

**Grumpy:** Ya 3amme, hayda prompt aw 7azzeira? Ana lezem khammen shu baddak?

**Doc:** L-fekra mawjoude, bass na2esna details. Shu 3am bisir w shu lezim ysir?

**Happy:** Yalla, ballashna! Halla2 nzid details w menzabeta!

**Sleepy:** ...l-prompt baddo context... w ana badde mkhadde...

**Sneezy:** ACHOO! Ya wayle, ba3tart l-7rouf! Halla2 min byelme l-context?

**Bashful:** Ma badde za33lak... bass l-AI ma bya3ref yi2ra afkar... sorry!

**Dopey:** Baddak l-bug yrou7? 7attetlo shanta! Sar jehiz lal-safar!

Full primary bank: `src/brain/canned.js`. Secondary bank: `src/brain/lebanese.js`. Idle quips: `src/brain/personalities.js`.

## Verification and real-provider evidence

Current routing verification (2026-09-17):
- 35 Node tests passed, including separate Gemini/DeepSeek conversation contracts, input/history validation, offline fallback and source-based queued routing.
- Actual Electron renderer/preload/main smoke passed: manual “fix it” stays conversation, follow-up history is sent, offline chat leaves prompt memory and Doc's target unchanged, synthetic IDE events are graded, and Sneezy sends/scores unchanged input. Existing cache/settings/offline-roast checks also pass. Isolated profile, mocked provider, listener off.
- Gate self-test, modified JavaScript syntax checks and `git diff --check` passed. No live provider calls or keyboard hook were used for this routing change.

Historical language-validation evidence below was recorded before the chat split, not reproduced by the routing tests. Earlier embedded listener C# compilation and synthetic context-reset checks passed without a live hook.

Earlier adapter probe using the saved Gemini configuration and generic prompts only:
- Grumpy: no adapter result after 639 ms; Arabizi canned fallback available.
- Doc: live result after 8,429 ms: "El-score 3/10. 2arayt jemal 3a 2anninet shampoo fiya details akhtar men hayda l-prompt; na2ssak context, l-lougha, w l-constraints."
- Happy: no adapter result after 327 ms; Arabizi canned fallback available.

Raw-response follow-up established the cause of the null results: HTTP 429 RESOURCE_EXHAUSTED — the Gemini free tier allows 20 requests/minute for this model and the account was exhausted by testing. This is external rate limiting, not an adapter defect. The designed behavior on 429 is a straight fallback to the local Arabizi bank (no retry/backoff, per the audited no-retry-theater contract), so a quota-limited demo still speaks Arabizi. Earlier direct-provider probes also produced Arabizi, but one took 25.9 seconds: the app's 12-second timeout is unchanged. Do not claim every live call succeeds or that latency is solved.

## Acceptance boundary

These tests establish wiring and fallback behavior, not native Lebanese fluency, comedy quality or pixel-perfect visual layout. The new live Doc sample still has awkward phrasing; native-speaker taste review remains pending. Review sentence naturalness, readability of spelling, personality distinction, and whether savage jokes target the prompt rather than the person. No blanket linguistic certification is claimed.
