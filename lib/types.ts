export type Tender = {
  id: string
  resource_id: string
  title: string
  authority: string | null
  description: string | null
  procurement_type: string | null
  procedure: string | null
  contract_type: string | null
  cpv_codes: string[]
  estimated_value: number | null
  published_at: string | null
  deadline_at: string | null
  clarification_deadline_at: string | null
  nuts_codes: string[]
  number_of_lots: number | null
  lot_names: string[]
  source_url: string
  relevance_score: number
  categories: string[]
  supply_only_status: 'eligible' | 'mixed' | 'excluded'
  supply_only_reason: string | null
  admin_override: 'none' | 'approve' | 'reject'
  admin_review_note: string | null
  admin_reviewed_at: string | null
  classifier_version: string | null
  last_classified_at: string | null
  status: 'open' | 'closed' | 'unknown'
  first_seen_at: string
  last_seen_at: string
}

export type TaxonomyRule = {
  id?: string
  category: string
  rule_type: 'cpv_prefix' | 'keyword' | 'exclude_keyword'
  value: string
  weight: number
  active: boolean
}
