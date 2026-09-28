import axios from "axios";
import type {
  Citation,
  Confidence,
  EventParticipant,
  Family,
  Filiation,
  Person,
  PersonDocument,
  PersonEvent,
  PersonInput,
  PersonSummary,
  ParticipantRole,
  RelationshipResult,
  ResearchNote,
  Source,
  SourceType,
  TreeGraph,
  UnionInput,
  UnionRecord,
  UnionWitness,
  User,
} from "./types";

// In production the frontend is served by nginx which proxies /api to the
// backend container (see frontend/nginx.conf) — same-origin, no CORS needed.
const api = axios.create({ baseURL: "/" });

const TOKEN_KEY = "genealogy_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

// ---------- Auth ----------

export async function login(email: string, password: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  const res = await api.post("/api/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data.access_token as string;
}

export async function fetchMe(): Promise<User> {
  const res = await api.get<User>("/api/auth/me");
  return res.data;
}

// ---------- Users ----------

export async function listUsers(): Promise<User[]> {
  const res = await api.get<User[]>("/api/users");
  return res.data;
}

export async function createUser(data: {
  email: string;
  password: string;
  full_name: string;
  role: string;
}): Promise<User> {
  const res = await api.post<User>("/api/users", data);
  return res.data;
}

export async function updateUser(
  id: string,
  data: Partial<{ full_name: string; role: string; is_active: boolean; password: string }>
): Promise<User> {
  const res = await api.patch<User>(`/api/users/${id}`, data);
  return res.data;
}

export async function updateMyTheme(data: {
  theme_primary_color?: string | null;
  theme_secondary_color?: string | null;
}): Promise<User> {
  const res = await api.patch<User>("/api/users/me/theme", data);
  return res.data;
}

// ---------- Persons ----------

export async function listPersons(search?: string, familyId?: string): Promise<PersonSummary[]> {
  const res = await api.get<PersonSummary[]>("/api/persons", { params: { search, family_id: familyId } });
  return res.data;
}

export async function getPerson(id: string): Promise<Person> {
  const res = await api.get<Person>(`/api/persons/${id}`);
  return res.data;
}

export async function createPerson(data: PersonInput): Promise<Person> {
  const res = await api.post<Person>("/api/persons", data);
  return res.data;
}

export async function updatePerson(id: string, data: Partial<PersonInput>): Promise<Person> {
  const res = await api.patch<Person>(`/api/persons/${id}`, data);
  return res.data;
}

export async function deletePerson(id: string): Promise<void> {
  await api.delete(`/api/persons/${id}`);
}

export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<{ url: string }>("/api/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.url;
}

// ---------- GEDCOM ----------

export interface GedcomImportResult {
  persons: number;
  unions: number;
  filiations: number;
  skipped_unions: number;
}

export async function exportGedcom(): Promise<void> {
  const res = await api.get("/api/gedcom/export", { responseType: "blob" });
  const blob = new Blob([res.data], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "arbre-genealogique.ged";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importGedcom(file: File): Promise<GedcomImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<GedcomImportResult>("/api/gedcom/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// ---------- Families ----------

export async function listFamilies(): Promise<Family[]> {
  const res = await api.get<Family[]>("/api/families");
  return res.data;
}

export async function createFamily(name: string): Promise<Family> {
  const res = await api.post<Family>("/api/families", { name });
  return res.data;
}

export async function renameFamily(id: string, name: string): Promise<Family> {
  const res = await api.patch<Family>(`/api/families/${id}`, { name });
  return res.data;
}

export async function deleteFamily(id: string): Promise<void> {
  await api.delete(`/api/families/${id}`);
}

// ---------- Documents ----------

export async function listDocuments(personId: string): Promise<PersonDocument[]> {
  const res = await api.get<PersonDocument[]>("/api/documents", { params: { person_id: personId } });
  return res.data;
}

export async function uploadDocument(personId: string, file: File): Promise<PersonDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<PersonDocument>("/api/documents", formData, {
    params: { person_id: personId },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/api/documents/${id}`);
}

// ---------- Unions ----------

export async function createUnion(data: UnionInput): Promise<UnionRecord> {
  const res = await api.post<UnionRecord>("/api/unions", data);
  return res.data;
}

export async function updateUnion(id: string, data: Partial<UnionInput>): Promise<UnionRecord> {
  const res = await api.patch<UnionRecord>(`/api/unions/${id}`, data);
  return res.data;
}

export async function deleteUnion(id: string): Promise<void> {
  await api.delete(`/api/unions/${id}`);
}

export async function addChild(unionId: string, childId: string, relationType = "biological"): Promise<Filiation> {
  const res = await api.post<Filiation>(`/api/unions/${unionId}/children`, {
    child_id: childId,
    union_id: unionId,
    relation_type: relationType,
  });
  return res.data;
}

export async function removeChild(filiationId: string): Promise<void> {
  await api.delete(`/api/unions/filiations/${filiationId}`);
}

// ---------- Tree ----------

export async function getTreeGraph(): Promise<TreeGraph> {
  const res = await api.get<TreeGraph>("/api/tree/graph");
  return res.data;
}

export default api;

// ---------- Events ----------

export async function listEvents(personId: string): Promise<PersonEvent[]> {
  const res = await api.get<PersonEvent[]>("/api/events", { params: { person_id: personId } });
  return res.data;
}

export async function createEvent(
  personId: string,
  data: { event_type: string; event_date?: string | null; event_date_approx?: boolean; place?: string | null; description?: string | null }
): Promise<PersonEvent> {
  const res = await api.post<PersonEvent>("/api/events", data, { params: { person_id: personId } });
  return res.data;
}

export async function deleteEvent(id: string): Promise<void> {
  await api.delete(`/api/events/${id}`);
}

export async function addEventParticipant(
  eventId: string,
  personId: string,
  role: ParticipantRole
): Promise<EventParticipant> {
  const res = await api.post<EventParticipant>(`/api/events/${eventId}/participants`, {
    person_id: personId,
    role,
  });
  return res.data;
}

export async function removeEventParticipant(id: string): Promise<void> {
  await api.delete(`/api/events/participants/${id}`);
}

// ---------- Union witnesses ----------

export async function listUnionWitnesses(unionId: string): Promise<UnionWitness[]> {
  const res = await api.get<UnionWitness[]>("/api/union-witnesses", { params: { union_id: unionId } });
  return res.data;
}

export async function addUnionWitness(unionId: string, personId: string, role?: string): Promise<UnionWitness> {
  const res = await api.post<UnionWitness>(
    "/api/union-witnesses",
    { person_id: personId, role: role || null },
    { params: { union_id: unionId } }
  );
  return res.data;
}

export async function removeUnionWitness(id: string): Promise<void> {
  await api.delete(`/api/union-witnesses/${id}`);
}

// ---------- Sources & citations ----------

export async function listSources(): Promise<Source[]> {
  const res = await api.get<Source[]>("/api/sources");
  return res.data;
}

export async function createSource(data: {
  title: string;
  source_type: SourceType;
  author?: string | null;
  repository?: string | null;
  url?: string | null;
  notes?: string | null;
}): Promise<Source> {
  const res = await api.post<Source>("/api/sources", data);
  return res.data;
}

export async function listCitationsForPerson(personId: string): Promise<Citation[]> {
  const res = await api.get<Citation[]>("/api/citations", { params: { person_id: personId } });
  return res.data;
}

export async function listCitationsForUnion(unionId: string): Promise<Citation[]> {
  const res = await api.get<Citation[]>("/api/citations", { params: { union_id: unionId } });
  return res.data;
}

export async function createCitation(data: {
  source_id: string;
  person_id?: string | null;
  union_id?: string | null;
  detail?: string | null;
  confidence: Confidence;
}): Promise<Citation> {
  const res = await api.post<Citation>("/api/citations", data);
  return res.data;
}

export async function deleteCitation(id: string): Promise<void> {
  await api.delete(`/api/citations/${id}`);
}

// ---------- Research notes ----------

export async function listResearchNotes(personId: string): Promise<ResearchNote[]> {
  const res = await api.get<ResearchNote[]>("/api/research-notes", { params: { person_id: personId } });
  return res.data;
}

export async function createResearchNote(personId: string, text: string): Promise<ResearchNote> {
  const res = await api.post<ResearchNote>("/api/research-notes", { text }, { params: { person_id: personId } });
  return res.data;
}

export async function updateResearchNote(id: string, data: { text?: string; done?: boolean }): Promise<ResearchNote> {
  const res = await api.patch<ResearchNote>(`/api/research-notes/${id}`, data);
  return res.data;
}

export async function deleteResearchNote(id: string): Promise<void> {
  await api.delete(`/api/research-notes/${id}`);
}

// ---------- Relationship calculator ----------

export async function getRelationship(person1Id: string, person2Id: string): Promise<RelationshipResult> {
  const res = await api.get<RelationshipResult>("/api/tree/relationship", {
    params: { person1_id: person1Id, person2_id: person2Id },
  });
  return res.data;
}
