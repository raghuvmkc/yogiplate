export type VerifiedAddress = {
  query: string;
  formatted: string;
  lat: number;
  lng: number;
  maps_url: string;
  provider: "google" | "nominatim";
  ok: true;
};

export type AddressVerifyResult =
  | VerifiedAddress
  | { ok: false; query: string; error: string };

const STREET_RE =
  /\b\d{1,6},?\s+[A-Za-z0-9.'\-][A-Za-z0-9.'\-\s]{1,60}\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pkwy|parkway|plaza|circle|cir|ter|terrace)\.?\b/i;

/** Heuristic: utterance looks like a street address worth geocoding. */
export function looksLikeStreetAddress(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length < 8 || t.length > 220) return false;
  if (STREET_RE.test(t)) return true;
  // Numbered line + ZIP
  if (/\b\d{1,6},?\s+\w+/.test(t) && /\b\d{5}(?:-\d{4})?\b/.test(t)) return true;
  return false;
}

function mapsUrl(lat: number, lng: number, label?: string) {
  const q = encodeURIComponent(label || `${lat},${lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

async function googleGeocode(query: string): Promise<VerifiedAddress | null> {
  const key = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!key) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      status?: string;
      results?: {
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }[];
    };
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const hit = data.results[0];
    const lat = Number(hit.geometry?.location?.lat);
    const lng = Number(hit.geometry?.location?.lng);
    const formatted = String(hit.formatted_address || "").trim();
    if (!formatted || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      ok: true,
      query,
      formatted,
      lat,
      lng,
      maps_url: mapsUrl(lat, lng, formatted),
      provider: "google",
    };
  } catch {
    return null;
  }
}

async function nominatimGeocode(query: string): Promise<VerifiedAddress | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "YogiplateCatering/1.0 (catering-front-desk)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    }[];
    const hit = data?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    const formatted = String(hit.display_name || "").trim();
    if (!formatted || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      ok: true,
      query,
      formatted,
      lat,
      lng,
      maps_url: mapsUrl(lat, lng, formatted),
      provider: "nominatim",
    };
  } catch {
    return null;
  }
}

export async function verifyAddress(
  rawQuery: string,
  cityHint?: string
): Promise<AddressVerifyResult> {
  const query = String(rawQuery || "").trim();
  if (query.length < 5) {
    return { ok: false, query, error: "Address too short to verify." };
  }
  const withCity =
    cityHint &&
    cityHint.trim() &&
    !query.toLowerCase().includes(cityHint.trim().toLowerCase())
      ? `${query}, ${cityHint.trim()}`
      : query;

  const google = await googleGeocode(withCity);
  if (google && isFullDeliveryAddress(google.formatted)) return google;
  const osm = await nominatimGeocode(withCity);
  if (osm && isFullDeliveryAddress(osm.formatted)) return osm;
  if (google || osm) {
    return {
      ok: false,
      query: withCity,
      error:
        "That matches a city, not a street. Share the house or building number, street, city, and ZIP.",
    };
  }
  return {
    ok: false,
    query: withCity,
    error: "Could not verify that address. Please check the street and ZIP.",
  };
}

/** Street number plus a street name. A city name alone is not a delivery address. */
export function isFullDeliveryAddress(text: string): boolean {
  return looksLikeStreetAddress(text);
}

function extractAddressSnippet(text: string): string | null {
  const t = String(text || "").trim();
  if (!t) return null;
  const street = t.match(STREET_RE);
  if (street && street.index != null) {
    // Take from street start through a following city/state/ZIP if present
    return t.slice(street.index, street.index + 180).replace(/\s+/g, " ").trim();
  }
  if (/\b\d{1,6},?\s+\w+/.test(t) && /\b\d{5}(?:-\d{4})?\b/.test(t)) {
    return t.slice(0, 180).trim();
  }
  return null;
}

/** Pick the best address string to verify for this chat turn. */
export function addressCandidateForTurn(input: {
  userText: string;
  draftAddress?: string;
  draftCity?: string;
  prevDraftAddress?: string;
}): string | null {
  const draft = String(input.draftAddress || "").trim();
  const prev = String(input.prevDraftAddress || "").trim();
  if (draft && draft !== prev && isFullDeliveryAddress(draft)) return draft;
  const fromUser = extractAddressSnippet(input.userText);
  if (fromUser && isFullDeliveryAddress(fromUser)) return fromUser;
  if (draft && isFullDeliveryAddress(draft)) return draft;
  return null;
}
