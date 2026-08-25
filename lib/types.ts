export type Tender = {
  id: string; resource_id: string; title: string; authority: string | null; description: string | null;
  procurement_type: string | null; procedure: string | null; contract_type: string | null; cpv_codes: string[];
  estimated_value: number | null; published_at: string | null; deadline_at: string | null; clarification_deadline_at: string | null;
  nuts_codes: string[]; number_of_lots: number | null; lot_names: string[]; source_url: string; relevance_score: number;
  categories: string[]; supply_only_status: 'eligible'|'mixed'|'excluded'; supply_only_reason: string | null;
  admin_override: 'none'|'approve'|'reject'; admin_review_note: string | null; admin_reviewed_at: string | null;
  classifier_version: string | null; last_classified_at: string | null; status: 'open'|'closed'|'unknown'; first_seen_at: string; last_seen_at: string
}
export type TaxonomyRule = { id?:string; category:string; rule_type:'cpv_prefix'|'keyword'|'exclude_keyword'; value:string; weight:number; active:boolean }
export type PlanningLead = {
  id:string; source_object_id:number; planning_authority:string|null; application_number:string|null; development_description:string|null;
  development_address:string|null; development_postcode:string|null; application_status:string|null; application_type:string|null; decision:string|null;
  project_stage:'watch'|'granted'|'starting_soon'|'active'|'completed'|'refused'|'withdrawn'|'expired'|'unknown'; applicant_name:string|null;
  applicant_address:string|null; agent_name:string|null; agent_company:string|null; site_area:number|null; floor_area:number|null;
  residential_units:number|null; one_off_house:boolean|null; received_date:string|null; decision_date:string|null; grant_date:string|null; expiry_date:string|null;
  latitude:number|null; longitude:number|null; source_url:string|null; project_type:string; relevance_score:number; categories:string[];
  estimated_opportunity_low:number|null; estimated_opportunity_high:number|null; estimated_opportunity_band:string|null; score_reason:string|null; ignored:boolean;
  commencement_number:string|null; commencement_date:string|null; commencement_status:string|null; commencement_source_url:string|null;
  first_seen_at:string; last_seen_at:string; distance_km?:number|null
}
