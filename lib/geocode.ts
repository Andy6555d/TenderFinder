// Converts a branch address into coordinates automatically, so members never need to know or
// look up their own latitude/longitude - typing an address is enough.
//
// Uses OpenStreetMap's free Nominatim service. No API key needed, but its usage policy requires
// a real identifying User-Agent and caps requests at roughly 1/second - both trivially satisfied
// here since this only runs when a member actually saves their branch address, not in bulk.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeIrishAddress(address: string, eircode?: string | null) {
  const query = [address, eircode, 'Ireland'].filter(Boolean).join(', ')
  if (!query.trim()) return null

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'ie',
    limit: '1'
  })

  try {
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
    // A geocoding failure should never block saving the rest of a member's preferences - they
    // just end up with no coordinates yet, same as if they'd left the address blank too.
    return null
  }
}
