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
}

export interface Person extends PersonSummary {
  birth_last_name: string | null;
  birth_date_approx: boolean;
  birth_place: string | null;
  death_date_approx: boolean;
  death_place: string | null;
  occupation: string | null;
  biography: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PersonInput = Omit<Person, "id" | "created_at" | "updated_at">;

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
