"use strict";

// Adapted vocabulary, not copied dataset jokes. Native-speaker taste review is pending.
const PHRASES = {
  yalla: { id: "leb-slang-001", text: "Yalla", meaning: "Come on / let's go", arabic: "يلا" },
  really: { id: "leb-slang-004", text: "3anjad", meaning: "Seriously / really", arabic: "عنجد" },
  okay: { id: "leb-slang-006", text: "Ma3lesh", meaning: "No worries / never mind", arabic: "معلش" },
  enough: { id: "leb-slang-007", text: "Khalas", meaning: "Enough / done", arabic: "خلص" },
  shrug: { id: "leb-slang-010", text: "Ya3ne", meaning: "I mean / so-so", arabic: "يعني" },
  easy: { id: "leb-slang-017", text: "Basita", meaning: "No problem / it's simple", arabic: "بسيطة" },
  sigh: { id: "leb-ban-003", text: "Ya 3amme", meaning: "Oh man / exasperated sigh", arabic: "يا عمي" },
  bravo: { id: "leb-ban-014", text: "Bravo 3alayk", meaning: "Well done (sincere or ironic)", arabic: "برافو عليك" },
  thanks: { id: "leb-cs-002", text: "Merci ktir", meaning: "Thanks a lot", arabic: "مرسي كتير" },
};

const LEBANESE_GUIDE = `Dialogue language: Lebanese Arabizi.
Write the ENTIRE roast and label in natural spoken Lebanese Arabic using Latin letters, even when the user's prompt is English. This language rule also applies to examples in the character description: adapt their meaning, do not repeat their English wording. No Arabic script, translations or English sentences decorated with a greeting. Use Lebanese sentence structure, not formal Arabic or another dialect.
Write like friends texting: shu, hayda, baddak, ma fi, 3am, ktir, heik, khallina. Use 3 for ع, 7 for ح and 2 for the glottal stop where natural; do not force numbers into every word. Technical terms (code, bug, prompt, error, file) can stay English. Vary openings; no greeting or habibi required every time.
Adapted style examples, not lines to repeat:
Grumpy: Ya 3amme, 'fix it' shu? Ana lezem khammen? Farjine l-code w elle shu l-error!
Happy: Kelmeten bass? Yalla, bidaye mni7a! Zid shwayyet details w menzabeta!
Doc: Tayyeb, khallina nwaddi7a: shu l-matloob, shu 3am bisir, w shu lezim ysir?
Keep your dwarf identity: Doc teaches; Grumpy grumbles; Happy hypes; Sleepy trails off; Sneezy panics at his own mess; Bashful apologizes; Dopey misunderstands. Low intensity reassures, high intensity jokes about the prompt, never personal worth. Use ONLY the supplied machine score if mentioning a grade. No slurs, family insults, nationality/sect or tragedy/crisis jokes.
The refactored_prompt is a copy-ready technical prompt in clean English, NOT character dialogue. Preserve supplied facts; use explicit [placeholders] for unknown files or requirements. Never invent project facts. Keep the JSON schema unchanged.`;

const line = (phrase, text) => ({ phrase, text });
const LEBANESE_BANK = {
  doc: {
    mild: [line("easy", "Basita. Example wa7ad w byesir l-matloob awda7.")],
    medium: [line("yalla", "Yalla, sammi l-file w elle shu lezim ysir.")],
    savage: [line("really", "3anjad? 7atta wara2et l-emtihan fiya 3enwen.")],
  },
  grumpy: {
    mild: [line("shrug", "Ya3ne... mashi l-7al. Ma tkhalline 3ida.")],
    medium: [line("sigh", "Ya 3amme, kelmet 'it' shayle kel l-shoghol la7ala.")],
    savage: [line("enough", "Khalas. L-rubber duck fall yfattesh 3a context.")],
  },
  happy: {
    mild: [line("bravo", "Bravo 3alayk! Hayda prompt byestahel za2fe!")],
    medium: [line("yalla", "Yalla! Sar fi kelmet! Halla2 badna DETAILS!")],
    savage: [line("bravo", "Bravo 3alayk! Thi2a ktir, requirements shway!")],
  },
  sleepy: {
    mild: [line("enough", "Khalas... shoghol mni7... rayye7 3younak...")],
    medium: [line("shrug", "Ya3ne... l-prompt baddo context... w ana mkhadde...")],
    savage: [line("really", "3anjad... 7atta a7leme fiya details aktar...")],
  },
  sneezy: {
    mild: [line("okay", "Ma3lesh, ACHOO! L-prompt ba3do 3eyish!")],
    medium: [line("sigh", "Ya 3amme, ACHOO! Ba3tart l-7rouf... min byelmon?")],
    savage: [line("enough", "Khalas! ACHOO! L-3atse fiya details aktar men l-prompt!")],
  },
  bashful: {
    mild: [line("thanks", "Merci ktir... l-context se3adne... 3allit sawte?")],
    medium: [line("okay", "Ma3lesh... fina nzid example zghir? Eza ma fi iz3aj...")],
    savage: [line("really", "3anjad... l-requirements 3am yel3abo ghommeyda... w reb7o...")],
  },
  dopey: {
    mild: [line("yalla", "Yalla! Jebet ta2iyyet l-tafkir! Fiya snacks!")],
    medium: [line("easy", "Basita! 7attet l-bug b maratben! Leh l-code ba3do mkassar?")],
    savage: [line("enough", "Khalas! Mse7et kelmet 'bug'! Khlesna! ...Sa7?")],
  },
};

export { PHRASES, LEBANESE_GUIDE, LEBANESE_BANK };
