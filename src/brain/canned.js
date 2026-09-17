// Offline roast bank. Keyed by dwarf × tier, plus trigger lines and Lebanese bubbles.
// Works with zero internet, zero API key. Demo never dies.

"use strict";

import { LEBANESE_BANK } from "./lebanese.js";

const BANK = {
  doc: {
    savage: [
      "I have graded university exams. This would fail the admission form.",
      "A map with no streets. A recipe with no ingredients. That is your prompt.",
      "Somewhere, a documentation writer just felt a disturbance.",
    ],
    medium: [
      "Missing context, missing constraints. The idea is there — the prompt isn't.",
      "Half a prompt. I grade halves: you get half a grade.",
      "Close. But 'close' deploys broken code at 2 AM.",
    ],
    mild: [
      "Good bones. Add one example and it writes itself.",
      "Nearly engineer-grade. Name the file and we're done.",
      "Respectable. A little specificity and it's excellent.",
    ],
  },
  grumpy: {
    savage: [
      "THIS is why the AI ignores you. THIS. Right here.",
      "I've seen better prompts from a cat walking on a keyboard. At least the cat had energy.",
      "Forty years I've done this job. FORTY YEARS. And you bring me 'fix it'.",
      "Somewhere, a rubber duck just resigned.",
    ],
    medium: [
      "Mediocre. Shocking. Truly nobody could have predicted this.",
      "You typed words. Technically. None of them useful.",
      "I refuse to grade this on a curve. There is no curve. There is a hole.",
    ],
    mild: [
      "...it's fine. There. I said something nice. Are you happy.",
      "Not the worst thing I've read today. The day was long.",
      "Passable. Don't let it go to your head.",
    ],
  },
  happy: {
    savage: [
      "I LOVE how little effort this took!! Truly inspiring!! The bar has never been lower!!",
      "AMAZING!! You managed to say SO little in SO many words!! A talent!!",
      "WOW!! This prompt believes in itself!! Nobody else does!! But IT DOES!!",
    ],
    medium: [
      "2/10?! That's 2 MORE THAN ZERO!! PROGRESS!!",
      "You SHOWED UP!! Most prompts just... don't!!",
      "Is it vague? A little!! Is it yours? TOTALLY!!",
    ],
    mild: [
      "A PROMPT GIFT!! Unwrapped it and everything!!",
      "Look at you, prompting!! I'm so proud I could combust!!",
      "SOLID WORK!! The AI is going to ENJOY this one!!",
    ],
  },
  sleepy: {
    savage: [
      "...this prompt kept me awake. I resent it... deeply...",
      "even the black hole sighed... and it's a VOID...",
      "I graded it half asleep... still saw everything wrong... zzz...",
    ],
    medium: [
      "...it's... fine... i guess... now go drink water...",
      "...zzz... oh. you're still typing. cool. cool cool...",
      "your prompt is... eh... your EYEBAGS however...",
    ],
    mild: [
      "...nice prompt... now rest your eyes... 20 seconds... do it...",
      "...good work today... the bed is calling... answer it...",
      "...hydration check... posture check... prompt check... zzz...",
    ],
  },
  sneezy: {
    savage: [
      "ACHOO. oh no. NOW look what you made me grade. It's RUINED. Like my sinuses.",
      "I sneezed on it and honestly?? It got BETTER. ACHOO. Marginally.",
      "This prompt arrived broken and I broke it MORE. ACHOO. We're even.",
    ],
    medium: [
      "ACHOO — oh that one had LETTERS EVERYWHERE. Half of them wrong.",
      "ah... AH... the dust... the VAGUENESS... it tickles... ACHOO.",
      "I can't tell if that was a prompt or pollen. ACHOO.",
    ],
    mild: [
      "ACHOO. oh. that one was... actually okay?? weird. ACHOO. nice.",
      "sneeze-checked. survives. barely. ACHOO. proud of you.",
      "clean prompt, dusty keyboard. ACHOO. fix the keyboard.",
    ],
  },
  bashful: {
    savage: [
      "um... I can't look... this is... the worst thing I've... I'm so sorry... so, so sorry...",
      "it's... um... oh no... I'll just say it... it's BAD. sorry!! SORRY!!",
      "I peeked through my fingers and... yeah... no... I'm sorry... please don't cry...",
    ],
    medium: [
      "um... it's a little... vague... sorry... a medium amount of vague... sorry again...",
      "I have notes... small ones... gentle ones... I'll email them... sorry...",
      "it's not... BAD bad... it's... um... I'm sorry, I have to go...",
    ],
    mild: [
      "it's... actually nice?? sorry... it is!! I'm not even being polite!!",
      "oh I LIKE this one... um... don't tell the others... sorry...",
      "good prompt... um... really good... okay bye. SORRY.",
    ],
  },
  dopey: {
    savage: [
      "3!! My favorite number!! ...what are we counting??",
      "you want it FIXED?? I hugged it!! It's not fixed but it's LOVED!!",
      "the prompt is bad?? I ate the prompt!! PROBLEM SOLVED!!",
    ],
    medium: [
      "you want a sorting algorithm? I MADE YOU A SALAD!! It's sorted by tastiness!!",
      "is 'context' a place?? I'll look there!! I found my hat there once!!",
      "I put the words in a bag and shook it!! Same prompt!! Different vibes!!",
    ],
    mild: [
      "BIG WORDS!! I read some of them!! The round ones are my favorite!!",
      "I HELPED. probably. the vibes say yes!!",
      "PROMPT ACQUIRED!! I will guard it with my LIFE!! or a nap!!",
    ],
  },
};

// Trigger-specific lines (any dwarf can deliver, or dedicated events use these).
const TRIGGERS = {
  two_am: [
    "GO. TO. BED.",
    "it is 2AM. the bug will still be there tomorrow. YOU need to not be.",
    "nothing good compiles at this hour. NOTHING.",
  ],
  vague_streak: [
    "THREE. Three lazy prompts in a row. I'm leaving. DOPEY! You're up!",
    "I quit. The potato has taken over my shift.",
  ],
  score_crash: [
    "Emergency happiness deployment!! You're doing GREAT!! Statistically no!! But SPIRITUALLY!!",
  ],
  memory_callback: [
    "THIS is the FOURTH 'fix it' today. FOUR. I counted. I always count.",
    "your worst prompt today was {worst}. I remember. I ALWAYS remember.",
    "average score today: {avg}. Yesterday you were {trend}. I keep receipts.",
  ],
  idle: [
    "...they left. they just... left. with the prompt like THIS...",
    "hello?? prompt services?? anyone??",
    "(hums theme song badly)",
  ],
  blackhole_warning: [
    "ok... that's enough... you've been at it for {minutes} minutes...",
    "the void opens in 10 seconds. hydrate. stretch. repent.",
  ],
};

// Lebanese spice — text bubbles only, voice stays gibberish.
const LEBANESE = Object.values(LEBANESE_BANK).flatMap((bank) =>
  Object.values(bank).flatMap((entries) => entries.map((entry) => entry.text))
);

function pickRoast(dwarfId, tier) {
  const list = (BANK[dwarfId] && BANK[dwarfId][tier]) || BANK.grumpy[tier] || BANK.grumpy.medium;
  return list[Math.floor(Math.random() * list.length)];
}

function pickTrigger(key, vars = {}) {
  const list = TRIGGERS[key] || [];
  let line = list[Math.floor(Math.random() * list.length)] || "...";
  for (const [k, v] of Object.entries(vars)) line = line.replaceAll(`{${k}}`, String(v));
  return line;
}

function maybeLebanese(chance = 0.18, dwarfId = "grumpy", tier = "medium") {
  if (Math.random() >= chance) return null;
  const bank = LEBANESE_BANK[dwarfId] || LEBANESE_BANK.grumpy;
  const list = bank[tier] || bank.medium;
  return list[Math.floor(Math.random() * list.length)].text;
}



export { pickRoast, pickTrigger, maybeLebanese, LEBANESE };
