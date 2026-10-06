import type { SiteSettings } from "@/lib/types";
import { calcDeliveryFee } from "@/lib/pricing";

/** Approximate Bay Area city coordinates for demo distance when Maps API is unset. */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  fremont: { lat: 37.5485, lng: -121.9886 },
  "san jose": { lat: 37.3382, lng: -121.8863 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
  "santa clara": { lat: 37.3541, lng: -121.9552 },
  cupertino: { lat: 37.323, lng: -122.0322 },
  mountainview: { lat: 37.3861, lng: -122.0839 },
  "mountain view": { lat: 37.3861, lng: -122.0839 },
  paloalto: { lat: 37.4419, lng: -122.143 },
  "palo alto": { lat: 37.4419, lng: -122.143 },
  "san francisco": { lat: 37.7749, lng: -122.4194 },
  oakland: { lat: 37.8044, lng: -122.2712 },
  berkeley: { lat: 37.8715, lng: -122.273 },
  hayward: { lat: 37.6688, lng: -122.0808 },
  unioncity: { lat: 37.5933, lng: -122.0438 },
  "union city": { lat: 37.5933, lng: -122.0438 },
  milpitas: { lat: 37.4323, lng: -121.8996 },
  dublin: { lat: 37.7022, lng: -121.9358 },
  pleasanton: { lat: 37.6624, lng: -121.8747 },
  livermore: { lat: 37.6819, lng: -121.768 },
  "san mateo": { lat: 37.563, lng: -122.3255 },
  redwoodcity: { lat: 37.4852, lng: -122.2364 },
  "redwood city": { lat: 37.4852, lng: -122.2364 },
  "santa rosa": { lat: 38.4404, lng: -122.7141 },
  walnutcreek: { lat: 37.9101, lng: -122.065 },
  "walnut creek": { lat: 37.9101, lng: -122.065 },
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function guessCoords(city: string, zip?: string) {
  const key = city.trim().toLowerCase();
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  // ZIP prefix heuristics for Bay Area
  if (zip) {
    const z = zip.slice(0, 3);
    if (["945", "946", "947"].includes(z)) return CITY_COORDS.oakland;
    if (["940", "941", "944"].includes(z)) return CITY_COORDS["san francisco"];
    if (["950", "951"].includes(z)) return CITY_COORDS["san jose"];
  }
  return CITY_COORDS.fremont;
}

async function googleDistanceMiles(
  origin: string,
  destination: string
): Promise<number | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json"
    );
    url.searchParams.set("origins", origin);
    url.searchParams.set("destinations", destination);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    const data = await res.json();
    const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value;
    if (typeof meters !== "number") return null;
    return meters / 1609.344;
  } catch {
    return null;
  }
}

export async function quoteDelivery(input: {
  address: string;
  city: string;
  state: string;
  zip: string;
  subtotal: number;
  settings: SiteSettings;
}) {
  const dest = `${input.address}, ${input.city}, ${input.state} ${input.zip}`;
  const origin = input.settings.kitchen_address;

  let miles =
    (await googleDistanceMiles(origin, dest)) ??
    haversineMiles(
      input.settings.kitchen_lat,
      input.settings.kitchen_lng,
      guessCoords(input.city, input.zip).lat,
      guessCoords(input.city, input.zip).lng
    );

  miles = Math.round(miles * 10) / 10;
  const inService = miles <= input.settings.service_radius_miles;
  const delivery_fee = inService
    ? calcDeliveryFee(miles, input.subtotal, input.settings)
    : 0;

  return {
    miles,
    delivery_fee,
    in_service: inService,
    service_radius_miles: input.settings.service_radius_miles,
    free_delivery_threshold: input.settings.free_delivery_threshold,
    tax_rate: input.settings.tax_rate,
  };
}
