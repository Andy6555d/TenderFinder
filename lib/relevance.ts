import type { TaxonomyRule } from '@/lib/types'

export const CLASSIFIER_VERSION = 'v2_context_aware_supply_relevance'

// Strong evidence that the supplier is expected to perform works/services rather than merely
// deliver goods. These phrases are deliberately obligation-focused. Generic references such as
// "maintenance staff", "for maintenance" or "maintenance facility" are NOT treated as mixed.
const STRONG_MIXED_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'supply and installation', regex: /\bsupply(?:,|\s)+(?:and\s+)?(?:delivery(?:,|\s)+(?:and\s+)?)?(?:full\s+)?installation\b/i },
  { label: 'supply and install', regex: /\bsupply(?:,|\s)+(?:and\s+)?install\b/i },
  { label: 'supply and fit', regex: /\bsupply(?:,|\s)+(?:and\s+)?fit(?:ting)?\b/i },
  { label: 'design, supply and install', regex: /\bdesign(?:,|\s)+(?:and\s+)?supply(?:,|\s)+(?:and\s+)?install/i },
  { label: 'installation included', regex: /\b(?:including|includes|inclusive of|with)\s+(?:the\s+)?installation\b/i },
  { label: 'installation services', regex: /\binstallation\s+(?:services?|works?|contract)\b/i },
  { label: 'supplier/contractor must install', regex: /\b(?:supplier|contractor|tenderer)\s+(?:shall|must|will|is required to)\s+.{0,45}\binstall/i },
  { label: 'maintenance services', regex: /\b(?:planned|preventative|preventive|reactive|ongoing|annual|routine)?\s*maintenance\s+(?:services?|contract|works?)\b/i },
  { label: 'service and maintenance', regex: /\b(?:service|servicing)\s+(?:and|&)\s+maintenance\b/i },
  { label: 'repair services', regex: /\brepair\s+(?:services?|works?|contract)\b/i },
  { label: 'servicing services', regex: /\bservicing\s+(?:services?|contract|works?)\b/i },
  { label: 'construction works', regex: /\bconstruction\s+works?\b/i },
  { label: 'building works', regex: /\bbuilding\s+works?\b/i },
  { label: 'refurbishment works', regex: /\brefurbishment\s+works?\b/i },
  { label: 'fit-out works', regex: /\bfit[ -]?out\s+works?\b/i },
  { label: 'labour and materials', regex: /\blabou?r\s+(?:and|&)\s+materials\b/i },
  { label: 'design and build', regex: /\bdesign\s+(?:and|&)\s+build\b/i },
  { label: 'works contract', regex: /\bworks\s+contract\b/i },
  { label: 'commissioning services', regex: /\bcommissioning\s+(?:services?|works?|contract)\b/i },
  { label: 'installation and commissioning', regex: /\binstallation\s+(?:and|&)\s+commissioning\b/i }
]

const SAFE_CONTEXT_PATTERNS: RegExp[] = [
  /\bmaintenance\s+(?:staff|team|department|personnel|crew|facility|facilities|workshop|workshops|stores?)\b/i,
  /\bfor\s+(?:use\s+in\s+)?maintenance\b/i,
  /\bused\s+(?:by|for|in)\s+.{0,30}\bmaintenance\b/i,
  /\bmaintenance\s+consumables?\b/i,
  /\bmaintenance\s+supplies?\b/i
]

const NEGATION_PREFIX = /(?:excluding|exclude|does not include|do not include|not including|without|no requirement for|not required to provide|no\s+)/i

function isNegated(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 55), index)
  return NEGATION_PREFIX.test(before)
}

function hasStrongMixedObligation(title: string, description: string | null) {
  const text = `${title}\n${description || ''}`
  for (const { label, regex } of STRONG_MIXED_PATTERNS) {
    const m = regex.exec(text)
    if (!m || m.index == null) continue
    if (isNegated(text, m.index)) continue
    const matched = m[0]
    // Avoid false positives where the only relevant word is descriptive context such as
    // "maintenance staff" or "for maintenance" rather than a supplier obligation.
    if (/maintenance/i.test(matched) && SAFE_CONTEXT_PATTERNS.some(p => p.test(text))) {
      const withoutSafe = SAFE_CONTEXT_PATTERNS.reduce((s, p) => s.replace(p, ' '), text)
      if (!regex.test(withoutSafe)) continue
    }
    return label
  }
  return null
}

export function classifySupplyOnly(title: string, description: string | null, procurementType: string | null) {
  const type = (procurementType || '').trim().toLowerCase()
  if (type !== 'supplies') {
    return {
      status: 'excluded' as const,
      reason: `Procurement Type is ${procurementType || 'not stated'}, not Supplies.`
    }
  }

  const mixed = hasStrongMixedObligation(title, description)
  if (mixed) {
    return {
      status: 'mixed' as const,
      reason: `Possible supplier works/services obligation detected: ${mixed}. Admin review recommended.`
    }
  }

  return {
    status: 'eligible' as const,
    reason: 'eTenders classifies this as Supplies and no clear supplier installation/works/service obligation was detected.'
  }
}

function keywordMatch(text: string, value: string) {
  return text.includes(value)
}

export function scoreTender(title: string, description: string | null, cpvCodes: string[], rules: TaxonomyRule[]) {
  const titleText = title.toLowerCase()
  const descriptionText = (description || '').toLowerCase()
  const categoryScores = new Map<string, number>()
  let exclusionPenalty = 0

  for (const rule of rules.filter(r => r.active !== false)) {
    const value = rule.value.toLowerCase().trim()
    if (!value) continue
    const baseWeight = Math.max(1, Math.abs(rule.weight || 10))

    if (rule.rule_type === 'cpv_prefix') {
      const normalized = value.replace(/\D/g, '')
      const matched = cpvCodes.some(code => code.replace(/\D/g, '').startsWith(normalized))
      if (!matched) continue
      // CPVs are authoritative structured evidence, so give them more weight than free text.
      const score = Math.round(baseWeight * 1.5)
      categoryScores.set(rule.category, (categoryScores.get(rule.category) || 0) + score)
      continue
    }

    const titleMatched = keywordMatch(titleText, value)
    const descriptionMatched = keywordMatch(descriptionText, value)
    if (!titleMatched && !descriptionMatched) continue

    if (rule.rule_type === 'exclude_keyword') {
      exclusionPenalty += Math.round(baseWeight * (titleMatched ? 1.4 : 0.8))
      continue
    }

    // A relevant word in the title is far stronger than a passing mention in a long description.
    const score = Math.round(baseWeight * (titleMatched ? 1.4 : 0.75))
    categoryScores.set(rule.category, (categoryScores.get(rule.category) || 0) + score)
  }

  const ranked = [...categoryScores.entries()]
    .map(([category, score]) => [category, Math.min(70, score)] as const)
    .sort((a, b) => b[1] - a[1])

  // Prevent keyword-rich descriptions from reaching 100 simply by mentioning many unrelated
  // merchant words. The strongest category carries most of the score; secondary categories add
  // supporting confidence only.
  const strongest = ranked[0]?.[1] || 0
  const secondary = ranked.slice(1, 4).reduce((sum, [, score]) => sum + score * 0.22, 0)
  const score = Math.max(0, Math.min(100, Math.round(strongest + secondary - exclusionPenalty)))

  return {
    score,
    categories: ranked.filter(([, s]) => s >= 10).slice(0, 6).map(([category]) => category)
  }
}
