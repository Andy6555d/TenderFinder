import type { TaxonomyRule } from '@/lib/types'

const MIXED_TERMS = [
  'installation', 'install and', 'supply and install', 'supply, delivery and installation',
  'maintenance', 'repair', 'servicing', 'construction works', 'building works', 'refurbishment works',
  'design and build', 'fit-out', 'fit out', 'fitting works', 'labour', 'contractor to install'
]

const SAFE_SUPPLY_TERMS = ['supply', 'supply and delivery', 'delivery of', 'purchase of', 'framework for the supply']

// Phrases that, when found shortly before a MIXED_TERMS hit, mean the notice is
// explicitly ruling the works/service element OUT rather than including it, e.g.
// "excluding installation", "does not include maintenance", "no repair works required".
// Without this, wording like that would wrongly get held back as "mixed".
const NEGATION_CUES = [
  'excluding', 'exclude', 'exclusive of', 'does not include', 'do not include', 'not including',
  'without', 'no requirement for', 'not required to provide', 'except for', 'other than'
]
const NEGATION_WINDOW = 40 // characters to look back before a mixed-term hit

function isNegatedOccurrence(text: string, matchStart: number) {
  const windowStart = Math.max(0, matchStart - NEGATION_WINDOW)
  const before = text.slice(windowStart, matchStart)
  return NEGATION_CUES.some(cue => before.includes(cue))
}

// Finds every occurrence of `term` in `text` and returns the ones NOT preceded by a negation cue.
// A term can appear both negated ("excluding installation") and un-negated elsewhere in the same
// notice, so this checks each occurrence individually rather than the term as a whole.
function findUnnegatedOccurrence(text: string, term: string) {
  let from = 0
  while (true) {
    const idx = text.indexOf(term, from)
    if (idx < 0) return null
    if (!isNegatedOccurrence(text, idx)) return idx
    from = idx + term.length
  }
}

export function classifySupplyOnly(title: string, description: string | null, procurementType: string | null) {
  const text = `${title} ${description || ''}`.toLowerCase()
  if ((procurementType || '').toLowerCase() !== 'supplies') {
    return { status: 'excluded' as const, reason: `Procurement Type is ${procurementType || 'not stated'}, not Supplies.` }
  }
  for (const term of MIXED_TERMS) {
    const idx = findUnnegatedOccurrence(text, term)
    if (idx !== null) {
      return { status: 'mixed' as const, reason: `Possible works/services content detected: "${term}".` }
    }
  }
  if (!SAFE_SUPPLY_TERMS.some(t => text.includes(t))) {
    return { status: 'mixed' as const, reason: 'Classified as Supplies by eTenders, but supply-only wording is not clear enough for automatic member release.' }
  }
  return { status: 'eligible' as const, reason: 'eTenders classifies this as Supplies and no installation/works/service wording was detected.' }
}

export function scoreTender(title: string, description: string | null, cpvCodes: string[], rules: TaxonomyRule[]) {
  const text = `${title} ${description || ''}`.toLowerCase()
  const categories = new Map<string, number>()
  let raw = 0
  let excluded = 0
  for (const rule of rules.filter(r => r.active !== false)) {
    const value = rule.value.toLowerCase().trim()
    let matched = false
    if (rule.rule_type === 'cpv_prefix') matched = cpvCodes.some(code => code.replace(/\D/g, '').startsWith(value.replace(/\D/g, '')))
    else matched = text.includes(value)
    if (!matched) continue
    if (rule.rule_type === 'exclude_keyword') { excluded += Math.abs(rule.weight || 30); continue }
    const w = Math.max(1, rule.weight || 10)
    raw += w
    categories.set(rule.category, (categories.get(rule.category) || 0) + w)
  }
  raw = Math.max(0, raw - excluded)
  const score = Math.min(100, raw)
  return {
    score,
    categories: [...categories.entries()].sort((a,b) => b[1]-a[1]).map(([c]) => c).slice(0, 6)
  }
}
