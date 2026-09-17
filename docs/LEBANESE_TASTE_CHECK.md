# Lebanese Roast Content — Taste Check (Omar only)

The vocabulary below references entries from the user-provided `lebanese_dialect_dataset.jsonl`; IDs trace vocabulary, not the newly written punchlines.
The 21 dwarf lines are already wired into the local build. **Native-speaker taste approval is pending**; this is a candidate set, not a linguistic certification.
The raw dataset is NOT in the repo. Its provenance and licensing have not been comprehensively audited, and many expressions are shared across regional dialects.

---

## 1. What changed in the app

| Where | What happens now |
|---|---|
| **Live LLM roasts** (key working) | The roast request now carries a small (tested at no more than 2KB) "Lebanese spice" guide: at most **one** short Arabizi phrase per roast, English punchline, no greeting-stacking, no crisis/politics jokes, refactored prompt stays clean English. Dwarf personalities stay authoritative — Doc still teaches, Grumpy still grumbles. |
| **Secondary bubbles** (live or offline roasts) | The 8 old invented Lebanese bubbles are **replaced** by 21 curated lines: **one per dwarf per tier** (7 × mild/medium/savage). The app picks a line matching whoever is on screen and how savage the roast is, so Sleepy never delivers Happy's hype. Chance unchanged (18% of roasts get a Lebanese bubble). |
| **Voice** | Gibberish per-character synth; there is no natural-language TTS. |

The old bubble set was replaced to keep jokes about prompt quality rather than nationality or personal worth. Register and naturalness still need native-speaker review; no blanket frequency or word-order claim is made here.

## 2. Selected vocabulary offered to the LLM

| Phrase | Means | Dataset ID |
|---|---|---|
| Yalla | come on / let's go | leb-slang-001 |
| 3anjad | seriously / really | leb-slang-004 |
| Ma3lesh | no worries / never mind | leb-slang-006 |
| Khalas | enough / done | leb-slang-007 |
| Ya3ne | I mean / so-so | leb-slang-010 |
| Basita | no problem / it's simple | leb-slang-017 |
| Ya 3amme | oh man (exasperated sigh) | leb-ban-003 |
| Bravo 3alayk | well done (sincere **or** ironic — the LLM is told eyebrows decide) | leb-ban-014 |
| Merci ktir | thanks a lot | leb-cs-002 |

Deliberately **excluded**: `Toqborni / Ya 2albi / Ya 7ayete` (romantic/family endearments — weird from a dwarf roasting your code), `3ayb 3alayk` (shame-based framing), `Bukra inshallah / Meche l 7al / wasta / exchange-rate` jokes (crisis/political territory — the hackathon is a fun demo, not a satire set), and The961 youth slang (`bakkalto`, `khaze2`, `mukheef`… — register couldn't be verified well enough to put on stage). The register of `Zahhit` and `Wozze` is uncertain, so they're left out too.

## 3. The 21 offline lines — review these

**Doc** (teacher)
- mild: *"Basita. One concrete example makes the task easier to teach."*
- medium: *"Yalla, name the target. A good prompt gives the reader a map."*
- savage: *"3anjad? Even a blank exam has a field for the subject."*

**Grumpy** (roaster)
- mild: *"Ya3ne... I can work with this. Don't make me repeat the compliment."*
- medium: *"Ya 3amme, 'it' is doing all the work in this prompt."*
- savage: *"Khalas. The rubber duck filed a complaint about missing context."*

**Happy** (hype)
- mild: *"Bravo 3alayk! A prompt worth cheering for!"*
- medium: *"Yalla! We have WORDS! Next achievement: SPECIFICS!"*
- savage: *"Bravo 3alayk! So much confidence, so little specification!"*

**Sleepy**
- mild: *"Khalas... good work... let your eyes rest too..."*
- medium: *"Ya3ne... the prompt needs context... I need a pillow..."*
- savage: *"3anjad... even my dreams have clearer requirements..."*

**Sneezy**
- mild: *"Ma3lesh, ACHOO! Your prompt survived me!"*
- medium: *"Ya 3amme, ACHOO! I scattered the letters... sorry about the mess!"*
- savage: *"Khalas! ACHOO! I sneezed out more detail than this prompt contains!"*

**Bashful**
- mild: *"Merci ktir... for the context... it helps. Sorry, was that too loud?"*
- medium: *"Ma3lesh... could we add one example? A tiny one? Sorry..."*
- savage: *"3anjad... the requirements are playing hide-and-seek... sorry, they're winning..."*

**Dopey**
- mild: *"Yalla! I brought my thinking hat! It has snacks in it!"*
- medium: *"Basita! I put the bug in a jar! Why is the code still broken?"*
- savage: *"Khalas! I deleted the word 'bug'! We're finished! ...Right?"*

## 4. What I need from you

1. **Phrase check**: any of the 9 vocab entries that read wrong to a native ear? (Especially `Bravo 3alayk` word order and `Ya 3amme` vs `Ya 3ammi` spelling — your dataset uses both.)
2. **Line check**: mark any of the 21 lines "no" and I rewrite just those.
3. **Amount check**: one phrase max per live roast, 18% chance offline — too much / too little / right?

The dataset stays the single source on your disk; the repo only carries the curated distillation above with IDs.
