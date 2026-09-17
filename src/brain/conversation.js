"use strict";

import { get, ORDER } from "./personalities.js";

const STYLES = {
  doc: "Patient, precise and curious; explain things clearly without grading the conversation.",
  grumpy: "Grumbly, dry and sarcastic, but still answer what was asked. Never demand a better prompt.",
  happy: "Cheerful and encouraging, with playful enthusiasm.",
  sleepy: "Drowsy and relaxed, with occasional trailing pauses, but stay relevant.",
  sneezy: "Occasionally sneeze and apologize, but never scramble or change the user's message.",
  bashful: "Shy, gentle and a little hesitant, but give a useful answer.",
  dopey: "Playfully literal and easily confused; keep jokes separate from factual answers.",
};

function conversationPayload(payload) {
  if (!payload || typeof payload.message !== "string" || !payload.message.trim() || payload.message.length > 4000) return null;
  const dwarf = get(ORDER.includes(payload.dwarfId) ? payload.dwarfId : "grumpy");
  const history = Array.isArray(payload.history) ? payload.history.slice(-10).filter((entry) =>
    entry && ["user", "assistant"].includes(entry.role) && typeof entry.content === "string" && entry.content.trim()
  ).map((entry) => ({ role: entry.role, content: entry.content.slice(0, 1000) })) : [];
  return { message: payload.message.trim(), dwarf, history };
}

function conversationSystem(dwarf) {
  return `You are ${dwarf.name}, a friendly desktop dwarf having an ordinary conversation. ${STYLES[dwarf.id]}
Write your entire reply in natural Lebanese Arabizi (Lebanese Arabic in Latin letters), even if the user writes English. Use shu, hayda, baddak, ma fi, 3am naturally; 3, 7 and 2 represent Arabic sounds. Technical terms can stay English. No Arabic script or English sentences with a Lebanese greeting attached.
Respond to the user's actual message and use the supplied conversation history for follow-ups. This is conversation, NOT prompt evaluation: never assign a numeric prompt score, critique missing context as a roast, or automatically produce a rewritten prompt. Answer questions, chat, and help when asked. Do not claim to have performed actions or accessed the IDE. Do not invent facts. No slurs, family insults, nationality/sect or tragedy jokes. Keep replies concise, normally 1-3 sentences. Return JSON with one string field: reply.`;
}

function offlineReply(message, dwarfId, error) {
  const failures = {
    missing_key: "Ma fi API key ma7fouz. Fout 3a Settings, 7ott l-key w ekbos SAVE.",
    rate_limit: "L-provider radd 429: quota aw rate limit. Hayda mish ya3ne l-key mesh ma7fouz. Check l-quota 3and l-provider; iza limit mo2aqqat, jarrib ba3den. Halla2 offline.",
    auth: "L-provider rafad l-access (401/403). Check l-key w permissions lal-provider li mkhtaro b Settings. L-key l-ma7fouz ma nmasa7.",
    model: "L-provider ma le2a l-model (404). Badna nraji3 l-model l-mkhtar. Halla2 offline.",
    timeout: "L-AI ta2akhar w kheles wa2et l-talab. L-key ma nmasa7; jarrib marra tenye ba3den. Halla2 offline.",
    network: "Ma wosel l-talab lal-AI: meshkle bel-ettesal. L-key ma nmasa7. Halla2 offline.",
    response: "Wosel radd men l-AI bas ma 2deret e2ra2o. Jarrib marra tenye. Halla2 offline.",
    provider: "L-provider raja3 error. Ma ra7 ekhtare3 jawab; jarrib ba3den. Halla2 offline.",
  };
  const name = get(dwarfId).name;
  const text = message.trim().toLowerCase();
  if (/^(hi|hello|hey|mar7aba|ahlan|salam)[!.\s]*$/.test(text)) {
    return `Ahla! Ana ${name}. Kifak lyom?`;
  }
  if (/^(thanks|thank you|merci( ktir)?|shukran|teslam)[!.\s]*$/.test(text)) {
    return "Ahla w sahla! Ma fi shi, ne7na hon la nse3ed ba3d.";
  }
  if (/^(kifak|kifik|how are you)[?!.\s]*$/.test(text)) {
    return dwarfId === "sleepy" ? "...mni7... bass badde nem shway. W enta kifak?" : "Mni7, ba3dne hon ma3ak! W enta kifak?";
  }
  if (Object.hasOwn(failures, error)) return failures[error];
  return "Halla2 ma 3am e2dar wossal lal-AI, fa ma ra7 ekhtare3 jawab. L-chat sheghghal b roudoud basita offline; mnkammel bas yerja3 l-ettesal.";
}

export { conversationPayload, conversationSystem, offlineReply };
