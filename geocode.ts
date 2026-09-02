// Converts a branch address/Eircode into coordinates automatically, so members never need to
// know or look up their own latitude/longitude.
//
// Two-tier approach:
// 1. Google's Geocoding API, if GOOGLE_MAPS_API_KEY is configured. Google and Eircode have had
//    an official data partnership since 2016, so this resolves Eircodes precisely - this is the
//    only reliable way to geocode by Eircode specifically.
// 2. OpenStreetMap's free Nominatim, with no key required, as a fallback. Nominatim has poor,
//    inconsistent Eircode coverage (a known, still-open gap in OSM's Irish data), so it's only
//    ever geocoding off the address text here, not the Eircode - a reasonable fallback for
//    town-level accuracy, not a substitute for tier 1 when Eircode precision actually matters.
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

async function geocodeViaGoogle(address: string, eircode: string | null) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null
  // Eircode first: it's the precise, authoritative identifier Google actually indexes for
  // Ireland. Address text is included too since it helps disambiguate when present.
  const query = [eircode, address, 'Ireland'].filter(Boolean).join(', ')
  if (!query.trim()) return null

  try {
    const params = new URLSearchParams({ address: query, region: 'ie', key: apiKey })
    const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    if (data.status !== 'OK') return null
    const location = data.results?.[0]?.geometry?.location
    const lat = Number(location?.lat)
    const lon = Number(location?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { latitude: lat, longitude: lon }
  } catch {
    return null
  }
}

async function geocodeViaNominatim(address: string, eircode: string | null) {
  // Eircode is included in the query text as a hint, but Nominatim's Irish postcode coverage is
  // unreliable, so this is realistically geocoding off the address portion in practice.
  const query = [address, eircode, 'Ireland'].filter(Boolean).join(', ')
  if (!query.trim()) return null

  try {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', countrycodes: 'ie', limit: '1' })
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': process.env.GEOCODE_USER_AGENT || 'TenderFinder-Planning/1.0 (branch address lookup)' },
      cache: 'no-store'
    })
    if (!response.ok) return null
    const results = await response.json()
    const hit = results?.[0]
    if (!hit) return null
    const lat = Number(hit.lat)
    const lon = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { latitude: lat, longitude: lon }
  } catch {
    return null
  }
}

export async function geocodeIrishAddress(address: string, eircode?: string | null) {
  const cleanEircode = (eircode || '').trim() || null
  const cleanAddress = (address || '').trim()
  if (!cleanAddress && !cleanEircode) return null

  const viaGoogle = await geocodeViaGoogle(cleanAddress, cleanEircode)
  if (viaGoogle) return viaGoogle

  // Falls back to Nominatim if no Google key is set, or Google couldn't resolve it - a
  // geocoding failure should never block saving the rest of a member's preferences.
  return geocodeViaNominatim(cleanAddress, cleanEircode)
}
