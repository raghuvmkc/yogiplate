import { GoogleGenerativeAI } from "@google/generative-ai";
import { prettyLabel } from "@/lib/quote-format";
import { serverEnv } from "@/lib/server-env";

const GEMINI_MODEL = "gemini-3.8-flash";

export type QuoteClosingInput = {
  customerName: string;
  occasion?: string | null;
  meal?: string | null;
  guestCount?: number | null;
  eventDate?: string | null;
  city?: string | null;
  diet?: string | null;
};

function fallbackClosing(input: QuoteClosingInput) {
  const first = input.customerName.trim().split(/\s+/)[0] || "friend";
  const occasion = String(input.occasion || "").trim();
  if (occasion) {
    return `It is a privilege to cook for your ${occasion}. May the day be unhurried and full of the people you love, and may every bite feel like a small blessing.`;
  }
  const meal = input.meal ? ` ${prettyLabel(input.meal).toLowerCase()}` : "";
  const where = input.city ? ` in ${input.city}` : "";
  const guests =
    input.guestCount && input.guestCount > 0
      ? ` for your ${input.guestCount} guests`
      : "";
  return `Thank you, ${first}, for trusting Yogiplate with this${meal}${where}${guests}. May the table be easy, the conversation warm, and the food a quiet reminder of how good fresh, sattvik cooking can feel.`;
}

function cleanClosing(raw: string) {
  let text = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length < 40) return "";
  if (text.length > 520) {
    const cut = text.slice(0, 500);
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"));
    text = (end > 80 ? cut.slice(0, end + 1) : cut).trim();
  }
  if (/\$\d|deposit|click here|http/i.test(text)) return "";
  return text;
}

/**
 * Closing paragraph for a quotation.
 * A named occasion becomes a wish for that day.
 * With no occasion, the model writes a fitting note from the facts we have.
 */
export async function composeQuoteClosing(
  input: QuoteClosingInput
): Promise<string> {
  const fallback = fallbackClosing(input);
  const key = serverEnv("GEMINI_API_KEY");
  if (!key) return fallback;

  const occasion = String(input.occasion || "").trim();
  const facts = [
    `Guest first name: ${(input.customerName || "Guest").split(/\s+/)[0]}`,
    occasion ? `Occasion: ${occasion}` : "Occasion: none stated",
    input.meal ? `Meal: ${input.meal}` : null,
    input.guestCount ? `Guests: ${input.guestCount}` : null,
    input.eventDate ? `Date: ${input.eventDate}` : null,
    input.city ? `City: ${input.city}` : null,
    input.diet ? `Diet: ${prettyLabel(input.diet)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instruction = occasion
    ? `Write 2 or 3 sentences wishing the guest well for this exact occasion: "${occasion}". Name the occasion naturally. Warm, gracious, professional. Sattvik kitchen voice. No emoji, no prices, no sign-off, no sales language.`
    : `The guest did not name an occasion. Do not invent a wedding, birthday, or any event. Write 2 or 3 sentences of thanks and a blessing for the gathering, using only the facts below. Warm, gracious, professional. Sattvik kitchen voice. No emoji, no prices, no sign-off, no sales language.`;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { temperature: 0.7, maxOutputTokens: 180 },
    });
    const result = await Promise.race([
      model.generateContent(
        `${instruction}\n\nFacts:\n${facts}\n\nPlain text only.`
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("closing_timeout")), 8000)
      ),
    ]);
    const text = cleanClosing(result.response.text() || "");
    return text || fallback;
  } catch {
    return fallback;
  }
}
