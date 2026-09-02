export const MEMBER_CATEGORIES = [
  'Building Materials', 'Timber', 'Insulation', 'Plumbing', 'Heating', 'Bathrooms & Sanitaryware',
  'Drainage & Civils', 'Roofing', 'Doors & Ironmongery', 'Hardware & Fixings', 'Tools',
  'Paint & Decorating', 'PPE & Workwear', 'Landscaping', 'Electrical & Lighting', 'General Merchant'
] as const

// latest=true restricts eTenders' search to currently live/open competitions only.
// Without it the same endpoint also returns closed and awarded notices going back years.
export const ETENDERS_SEARCH_URL = 'https://www.etenders.gov.ie/epps/quickSearchAction.do?latest=true&searchType=cftFTS'
export const ETENDERS_DETAIL_BASE = 'https://www.etenders.gov.ie/epps/cft/prepareViewCfTWS.do?resourceId='

// A tender is badged "New" in the member dashboard while it's within this many hours of first being seen.
export const NEW_WITHIN_HOURS = 24
// A tender is badged "Closing soon" once its deadline is within this many days.
export const CLOSING_SOON_DAYS = 5
