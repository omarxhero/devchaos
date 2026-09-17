// Offline dialogue. Keyed by dwarf × tier; technical prompt rewrites live separately.
// Works with zero internet, zero API key. Native-speaker taste review is pending.

"use strict";

import { LEBANESE_BANK } from "./lebanese.js";

const BANK = {
  doc: {
    savage: [
      "Hayda l-prompt metel kharita bala shwere3. 7added l-matloob w 3tine example la na3ref wen ray7in.",
      "7atta wara2et l-emtihan fiya 3enwen. Khallina nballesh b shu baddak men l-code.",
      "Ma fi context wala constraints. L-AI baddo ta3limet, mish 7azzeira.",
    ],
    medium: [
      "L-fekra mawjoude, bass na2esna details. Shu 3am bisir w shu lezim ysir?",
      "Khallina nzid example wa7ad w constraint. Heik l-prompt byesir awda7.",
      "Tayyeb, bass ayya file? Sammi l-target la ma ndallna nkhammen.",
    ],
    mild: [
      "Mni7! Example zghir w byekmal l-prompt.",
      "Heik l-matloob wade7. Khallina n7added kif badna net2akkad enno l-7all mazbout.",
      "Shoghol mratab. L-context 3am yse3ed ktir.",
    ],
  },
  grumpy: {
    savage: [
      "Ya 3amme, hayda prompt aw 7azzeira? Ana lezem khammen shu baddak?",
      "L-bisse da3aset 3al keyboard w 3atet context aktar. Farjine l-code w elle shu l-error!",
      "Arb3in sene bel-shoghol w ba3dne 3am e2ra 'fix it'. Fix SHU?!",
      "7atta l-rubber duck zahe2 w fall. Ma la2a details la yesma3a.",
    ],
    medium: [
      "Fi kelmet, eh. Bass l-details wen?",
      "Ya3ne lezim es7ab l-context mennak kelme kelme? Sammi l-file w khallesna.",
      "Hayda noss prompt. L-noss l-tene 3am ya3mol break?",
    ],
    mild: [
      "...mni7. Elt shi mni7, ma tkhalline 3ida.",
      "Ma 3ande ktir la etshakka. Gharibe hal marra.",
      "Mashi l-7al. Bass ma tekhod 3a khatrak enno 3ajabne.",
    ],
  },
  happy: {
    savage: [
      "WAW! Addesh fi thi2a w addesh ma fi details! Hayde badde ella applause!",
      "Shu hal thi2a! Ya ret l-context eje ma3a kamen!",
      "Ma fi requirements? Ya salam, kel shi momken! W kel shi ghalat kamen!",
    ],
    medium: [
      "Yalla, ballashna! Halla2 nzid details w menzabeta!",
      "L-fekra mawjoude! Na2esna example wa7ad w mna3mol 7afle!",
      "Enta katabet prompt! Halla2 khallina nkhalle l-AI yefhamo kamen!",
    ],
    mild: [
      "Bravo 3alayk! Hayda prompt byefra7 l-2alb!",
      "Shu hal context l-mratab! Ana mabsout aktar men l-AI!",
      "HEIK L-SHOGHOL! L-matloob wade7 w l-details mawjoude!",
    ],
  },
  sleepy: {
    savage: [
      "...hayda l-prompt sa77ane... ma ken fi de3e...",
      "...7atta l-black hole tnaffas... ma 3eref shu yebla3...",
      "...ana noss neyim w ba3dne sheyif enno na2es context...",
    ],
    medium: [
      "...zid shwayyet details... w shrab may...",
      "...ba3dak 3am tekteb?... tayyeb... ana 3am ettawweb...",
      "...l-prompt baddo context... w ana badde mkhadde...",
    ],
    mild: [
      "...mni7... halla2 rayye7 3younak shway...",
      "...shoghol mratab... l-takhet 3am ynadik...",
      "...l-prompt tamam... may w break w menkammel...",
    ],
  },
  sneezy: {
    savage: [
      "ACHOO! Ya wayle, ba3tart l-7rouf! Halla2 min byelme l-context?",
      "3atast 3al prompt w sar awda7 shway. ACHOO! Ma kenet 2asde!",
      "Ken na2so details w ana tayyart l-be2e. ACHOO! Ma3lesh!",
    ],
    medium: [
      "ACHOO! L-7rouf saro b kel ma7all! Min bya3ref ayya wa7de la wen?",
      "Ah... AH... l-context mkhabba bel-ghabra? ACHOO!",
      "Hayda prompt aw 7assesiyye? ACHOO! Ma 3am 2e2dar mayyez!",
    ],
    mild: [
      "ACHOO! Ba3do wade7! Hayda prompt bye7mol 3atse!",
      "L-3atse ma kharrabet l-prompt! Bravo 3alayk!",
      "L-prompt ndif, l-keyboard mghabbar. ACHOO! Naddfo shway!",
    ],
  },
  bashful: {
    savage: [
      "Euh... l-context mkhabba... w ana ma 3am le2i... sorry...",
      "Ma badde za33lak... bass l-AI ma bya3ref yi2ra afkar... sorry!",
      "...fina nzid requirements? La2anno halla2 ma fi... ma3lesh...",
    ],
    medium: [
      "...na2es shwayyet details... eza ma fi iz3aj...",
      "3ande mola7aza zghire... example wa7ad byese3ed... sorry...",
      "Mish ghalat... bass mish wade7 ktir... ma3lesh...",
    ],
    mild: [
      "...3ajabne! 3anjad... mish bass 3am bejmel...",
      "Ktir mratab... bass ma t2ellon enno ana elet...",
      "Prompt mni7... ya3ne mni7 ktir... merci!",
    ],
  },
  dopey: {
    savage: [
      "Baddak l-bug yrou7? 7attetlo shanta! Sar jehiz lal-safar!",
      "Baddak fix? Lazza2to b scotch! Leh ba3do ma 3am yeshtighil?",
      "L-prompt na2es? Akalet l-be2e! Fakkarto snack!",
    ],
    medium: [
      "Baddak sorting? Rattabet l-salata 7asab l-alwen!",
      "L-context wen? Dawwart ta7t l-ta2iyye w la2et biscuit!",
      "7attet l-kelmet b kis w rajjayto! Sar 3anna prompt jdid!",
    ],
    mild: [
      "Kelmet kbar! 2rit kam wa7de! L-be2e 7elwe shaklon!",
      "ANA SE3ADET! Ma ba3ref kif, bass 7asset heik!",
      "Ra7 e7rose hal prompt! Bass eza ne3set, 7adan ykammel 3anne!",
    ],
  },
};

const TRIGGERS = {
  two_am: [
    "YALLA. ROU7. NEM.",
    "Saret 2 bel-leil. L-bug byontor la bokra, enta rayye7 shway.",
    "L-compile ma 3am yezbat? Jarrib ta3mol restart la 3younak.",
  ],
  vague_streak: [
    "TLETE prompts bala context! Ana fellet. DOPEY! Khod ma7alle!",
    "Khalas, sallamet l-shift la Dopey. Dabbro raskon.",
  ],
  score_crash: ["Yalla, menzabeta! L-score nezil bass ana ba3dne m2amman fik!"],
  memory_callback: [
    "Ba3dne mnetbe7 3al prompts. L-context ma byekhba 3anne!",
    "L-prompt li akhad a2all score lyom ken {worst}. Eh, ba3dne metzakkar.",
    "L-average lyom {avg}. Khallina nerfa3o shwayyet details.",
  ],
  idle: [
    "...fallo w tarakoule l-prompt heik...",
    "Alo? Fi 7ada bado yekteb prompt?",
    "...la la la... nsit be2e l-ghenniyye...",
  ],
  blackhole_warning: [
    "Khalas... sarlek {minutes} minutes 3am teshtighil... rayye7 shway...",
    "L-black hole jeye... shrab may w maddid dahrak...",
  ],
};

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
