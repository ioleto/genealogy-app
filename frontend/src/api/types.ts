export type UserRole = "admin" | "editor" | "viewer";
export type Sex = "M" | "F" | "U";
export type UnionType = "marriage" | "civil_union" | "partnership" | "unknown";
export type FiliationType = "biological" | "adoptive" | "foster" | "step";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  theme_primary_color: string | null;
  theme_secondary_color: string | null;
  created_at: string;
}

export interface PersonSummary {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  sex: Sex;
  family_id: string | null;
}

export interface Person extends PersonSummary {
  birth_last_name: string | null;
  nickname: string | null;
  is_living: boolean | null;
  birth_date_approx: boolean;
  birth_place: string | null;
  death_date_approx: boolean;
  death_place: string | null;
  cause_of_death: string | null;
  occupation: string | null;
  biography: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PersonInput = Omit<Person, "id" | "created_at" | "updated_at">;

export interface Family {
  id: string;
  name: string;
  created_at: string;
}

export interface PersonDocument {
  id: string;
  person_id: string;
  filename: string;
  url: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface UnionRecord {
  id: string;
  partner1_id: string;
  partner2_id: string | null;
  union_type: UnionType;
  union_date: string | null;
  union_date_approx: boolean;
  union_place: string | null;
  end_date: string | null;
  end_reason: string | null;
  notes: string | null;
}

export type UnionInput = Omit<UnionRecord, "id">;

export interface Filiation {
  id: string;
  child_id: string;
  union_id: string;
  relation_type: FiliationType;
}

export interface TreeGraph {
  persons: Person[];
  unions: UnionRecord[];
  filiations: Filiation[];
}

// ---------- Events ----------

export type EventType = "baptism" | "burial" | "residence" | "military_service" | "other";
export type ParticipantRole = "godfather" | "godmother" | "witness" | "other";

export interface EventParticipant {
  id: string;
  event_id: string;
  person_id: string;
  role: ParticipantRole;
}

export interface PersonEvent {
  id: string;
  person_id: string;
  event_type: EventType;
  event_date: string | null;
  event_date_approx: boolean;
  place: string | null;
  description: string | null;
  created_at: string;
  participants: EventParticipant[];
}

// ---------- Union witnesses ----------

export interface UnionWitness {
  id: string;
  union_id: string;
  person_id: string;
  role: string | null;
}

// ---------- Sources & citations ----------

export type SourceType = "parish_register" | "civil_record" | "census" | "correspondence" | "oral_testimony" | "other";
export type Confidence = "low" | "medium" | "high";

export interface Source {
  id: string;
  title: string;
  source_type: SourceType;
  author: string | null;
  repository: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Citation {
  id: string;
  source_id: string;
  person_id: string | null;
  union_id: string | null;
  detail: string | null;
  confidence: Confidence;
  created_at: string;
  source: Source;
}

// ---------- Research notes ----------

export interface ResearchNote {
  id: string;
  person_id: string;
  text: string;
  done: boolean;
  created_at: string;
}

// ---------- Relationship calculator ----------

export interface RelationshipResult {
  label: string;
  path_description: string;
}
