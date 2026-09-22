import axios from "axios";
import type {
  Family,
  Filiation,
  Person,
  PersonInput,
  PersonSummary,
  TreeGraph,
  UnionInput,
  UnionRecord,
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
