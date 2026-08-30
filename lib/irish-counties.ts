// Approximate county centroids for the location picker on the Planning page. This deliberately
// replaces address/Eircode geocoding: a county-level starting point plus an adjustable radius is
// far more robust than depending on an external geocoding service, and it's what members actually
// asked to use when testing - "just pick a county" rather than type and hope an address resolves.
// Precision is coarser than a geocoded address (a county can be 50km+ across), which is a real
// trade-off worth knowing, not something to paper over.
export const IRISH_COUNTIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Carlow', lat: 52.6541, lon: -6.9261 },
  { name: 'Cavan', lat: 53.9908, lon: -7.3606 },
  { name: 'Clare', lat: 52.8437, lon: -8.9850 },
  { name: 'Cork', lat: 51.8985, lon: -8.4756 },
  { name: 'Donegal', lat: 54.6538, lon: -8.1097 },
  { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
  { name: 'Galway', lat: 53.2707, lon: -9.0568 },
  { name: 'Kerry', lat: 52.1545, lon: -9.5669 },
  { name: 'Kildare', lat: 53.1589, lon: -6.9096 },
  { name: 'Kilkenny', lat: 52.6541, lon: -7.2448 },
  { name: 'Laois', lat: 52.9931, lon: -7.3326 },
  { name: 'Leitrim', lat: 54.1247, lon: -8.0007 },
  { name: 'Limerick', lat: 52.6638, lon: -8.6267 },
  { name: 'Longford', lat: 53.7275, lon: -7.7933 },
  { name: 'Louth', lat: 53.9253, lon: -6.4489 },
  { name: 'Mayo', lat: 53.8500, lon: -9.3000 },
  { name: 'Meath', lat: 53.6055, lon: -6.6564 },
  { name: 'Monaghan', lat: 54.2492, lon: -6.9683 },
  { name: 'Offaly', lat: 53.2734, lon: -7.4894 },
  { name: 'Roscommon', lat: 53.7677, lon: -8.2265 },
  { name: 'Sligo', lat: 54.2697, lon: -8.4694 },
  { name: 'Tipperary', lat: 52.6800, lon: -7.9200 },
  { name: 'Waterford', lat: 52.2593, lon: -7.1101 },
  { name: 'Westmeath', lat: 53.5345, lon: -7.4653 },
  { name: 'Wexford', lat: 52.3369, lon: -6.4633 },
  { name: 'Wicklow', lat: 52.9808, lon: -6.0446 }
]

export function findCounty(name: string | null | undefined) {
  return IRISH_COUNTIES.find(c => c.name === name) || null
}
