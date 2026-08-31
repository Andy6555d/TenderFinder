// A plain categorical county filter over planning_authority text - no coordinates, no distance
// math, no geolocation of any kind. Most local authorities include their county name directly
// ("Kildare County Council"), so matching on that name as a substring works for 25 of 26 counties.
// Dublin is the one exception: its four constituent authorities don't all contain "Dublin"
// (Fingal, Dún Laoghaire-Rathdown), so it needs its own explicit list.
export const IRISH_COUNTIES = [
  'Carlow','Cavan','Clare','Cork','Donegal','Dublin','Galway','Kerry','Kildare','Kilkenny',
  'Laois','Leitrim','Limerick','Longford','Louth','Mayo','Meath','Monaghan','Offaly',
  'Roscommon','Sligo','Tipperary','Waterford','Westmeath','Wexford','Wicklow'
] as const

const DUBLIN_AUTHORITIES = ['Dublin','Fingal','Dun Laoghaire','Dún Laoghaire','South Dublin']

// Returns the set of text patterns to match against planning_authority for a given county name.
export function authorityPatternsFor(county: string | null | undefined): string[] | null {
  if (!county) return null
  if (county === 'Dublin') return DUBLIN_AUTHORITIES
  return IRISH_COUNTIES.includes(county as any) ? [county] : null
}
