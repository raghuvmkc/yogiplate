/**
 * When the quote is already out, these turns mean the guest is done —
 * stop the voice call instead of chatting forever with room noise.
 */
const FAREWELL_OR_SOFT_CLOSE =
  /^(hmm+|hm+|uh+|um+|ah+|mm+|ok|okay|k|kk|yeah|yep|yup|sure|alright|all right|got it|cool|great|perfect|nice|wonderful|thanks|thank you|thank you so much|thanks a lot|thanks so much|ok thanks|okay thanks|yeah sure|yeah thanks|sure thanks|bye|goodbye|good bye|bye bye|see you|take care|that'?s all|thats all|nothing else|no thanks|no thank you|all good|i'?m good|im good|we'?re good|were good)[.!?, ]*$/i;

const FAREWELL_PHRASE =
  /\b(bye|goodbye|good bye|thank you|thanks|take care|see you|that'?s all|nothing else)\b/i;

/** True when the guest is wrapping up after a quote (not asking for changes). */
export function guestIsClosingAfterQuote(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (FAREWELL_OR_SOFT_CLOSE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && FAREWELL_PHRASE.test(t) && !/\b(change|add|remove|more|less|also|instead|allergy|vegan|jain|address|time|date)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Mic / STT often picks up TV, other languages, or fragments after the call
 * should already be over. Drop those instead of sending another Gemini turn.
 */
export function looksLikeAmbientNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (/^(border is r|hmm+|hm+|uh+|um+|ah+|mm+|uh huh)$/i.test(t)) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  // Mostly non-Latin (room chatter in another language) with almost no English.
  if (letters < 3 && /[^\u0000-\u007f]/.test(t)) return true;
  return false;
}
