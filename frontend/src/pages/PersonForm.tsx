import { FormEvent, ChangeEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addChild,
  addEventParticipant,
  addUnionWitness,
  createCitation,
  createEvent,
  createPerson,
  createResearchNote,
  createUnion,
  deleteCitation,
  deleteDocument,
  deleteEvent,
  deletePerson,
  deleteResearchNote,
  deleteUnion,
  extractErrorMessage,
  getPerson,
  getRelationship,
  getTreeGraph,
  listCitationsForPerson,
  listCitationsForUnion,
  listDocuments,
  listEvents,
  listResearchNotes,
  listUnionWitnesses,
  removeChild,
  removeEventParticipant,
  removeUnionWitness,
  updatePerson,
  updateResearchNote,
  uploadDocument,
  uploadPhoto,
} from "../api/client";
import type {
  Citation,
  Confidence,
  ParticipantRole,
  Person,
  PersonDocument,
  PersonEvent,
  PersonInput,
  PersonSummary,
  RelationshipResult,
  ResearchNote,
  TreeGraph,
  UnionRecord,
  UnionType,
  UnionWitness,
} from "../api/types";
import PersonPicker from "../components/PersonPicker";
import FamilySelect from "../components/FamilySelect";
import SourceSelect from "../components/SourceSelect";
import { useAuth } from "../auth/AuthContext";
import "./PersonForm.css";

const emptyForm: PersonInput = {
  first_name: "",
  last_name: "",
  birth_last_name: null,
  nickname: null,
  sex: "U",
  is_living: null,
  birth_date: null,
  birth_date_approx: false,
  birth_place: null,
  death_date: null,
  death_date_approx: false,
  death_place: null,
  cause_of_death: null,
  occupation: null,
  biography: null,
  photo_url: null,
  family_id: null,
};

const UNION_LABELS: Record<UnionType, string> = {
  marriage: "Mariage",
  civil_union: "Union civile",
  partnership: "Concubinage",
  unknown: "Non précisé",
};

function toSummary(p: Person): PersonSummary {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    birth_date: p.birth_date,
    death_date: p.death_date,
    sex: p.sex,
    family_id: p.family_id,
  };
}

export default function PersonForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [form, setForm] = useState<PersonInput>(emptyForm);
  const [graph, setGraph] = useState<TreeGraph | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!isNew && id) {
          const [person, g] = await Promise.all([getPerson(id), getTreeGraph()]);
          if (cancelled) return;
          const { id: _pid, created_at, updated_at, ...rest } = person;
          setForm(rest);
          setGraph(g);
        } else {
          const g = await getTreeGraph();
          if (!cancelled) setGraph(g);
        }
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, "Chargement impossible."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function set<K extends keyof PersonInput>(key: K, value: PersonInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadPhoto(file);
      set("photo_url", url);
    } catch (err) {
      setError(extractErrorMessage(err, "Le téléversement de la photo a échoué."));
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await createPerson(form);
        navigate(`/fiches/${created.id}`, { replace: true });
      } else if (id) {
        await updatePerson(id, form);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm("Supprimer définitivement cette fiche et tous ses liens familiaux ?")) return;
    setSaving(true);
    setError(null);
    try {
      await deletePerson(id);
      navigate("/fiches");
    } catch (err) {
      setError(extractErrorMessage(err, "Suppression impossible."));
      setSaving(false);
    }
  }

  async function refreshGraph() {
    if (!id) return;
    setGraph(await getTreeGraph());
  }

  if (loading) return <div className="page muted">Chargement…</div>;

  const personById = new Map((graph?.persons ?? []).map((p) => [p.id, p]));
  const myUnions: UnionRecord[] = id
    ? (graph?.unions ?? []).filter((u) => u.partner1_id === id || u.partner2_id === id)
    : [];
  const myParentFiliations = id ? (graph?.filiations ?? []).filter((f) => f.child_id === id) : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isNew ? "Nouvelle fiche" : `${form.first_name} ${form.last_name}`.trim() || "Fiche"}</h1>
        {!isNew && canEdit && (
          <button className="btn btn-danger-text" onClick={handleDelete} type="button" disabled={saving}>
            Supprimer la fiche
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="card person-form-card">
        <div className="field-row">
          <div className="field">
            <label htmlFor="first_name">Prénom</label>
            <input
              id="first_name"
              required
              disabled={!canEdit}
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="last_name">Nom</label>
            <input
              id="last_name"
              required
              disabled={!canEdit}
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="family">Famille</label>
          <FamilySelect value={form.family_id} onChange={(v) => set("family_id", v)} disabled={!canEdit} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="birth_last_name">Nom de naissance (si différent)</label>
            <input
              id="birth_last_name"
              disabled={!canEdit}
              value={form.birth_last_name ?? ""}
              onChange={(e) => set("birth_last_name", e.target.value || null)}
            />
          </div>
          <div className="field">
            <label htmlFor="nickname">Surnom / nom d'usage</label>
            <input
              id="nickname"
              disabled={!canEdit}
              value={form.nickname ?? ""}
              onChange={(e) => set("nickname", e.target.value || null)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="sex">Sexe</label>
            <select id="sex" disabled={!canEdit} value={form.sex} onChange={(e) => set("sex", e.target.value as any)}>
              <option value="U">Non précisé</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="is_living">Statut</label>
            <select
              id="is_living"
              disabled={!canEdit}
              value={form.is_living === null ? "" : form.is_living ? "living" : "deceased"}
              onChange={(e) => set("is_living", e.target.value === "" ? null : e.target.value === "living")}
            >
              <option value="">Non précisé</option>
              <option value="living">Vivant·e</option>
              <option value="deceased">Décédé·e</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="birth_date">Date de naissance</label>
            <input
              id="birth_date"
              type="date"
              disabled={!canEdit}
              value={form.birth_date ?? ""}
              onChange={(e) => set("birth_date", e.target.value || null)}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.birth_date_approx}
                onChange={(e) => set("birth_date_approx", e.target.checked)}
              />
              Date approximative
            </label>
          </div>
          <div className="field">
            <label htmlFor="birth_place">Lieu de naissance</label>
            <input
              id="birth_place"
              disabled={!canEdit}
              value={form.birth_place ?? ""}
              onChange={(e) => set("birth_place", e.target.value || null)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="death_date">Date de décès</label>
            <input
              id="death_date"
              type="date"
              disabled={!canEdit}
              value={form.death_date ?? ""}
              onChange={(e) => set("death_date", e.target.value || null)}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={form.death_date_approx}
                onChange={(e) => set("death_date_approx", e.target.checked)}
              />
              Date approximative
            </label>
          </div>
          <div className="field">
            <label htmlFor="death_place">Lieu de décès</label>
            <input
              id="death_place"
              disabled={!canEdit}
              value={form.death_place ?? ""}
              onChange={(e) => set("death_place", e.target.value || null)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="cause_of_death">Cause du décès</label>
          <input
            id="cause_of_death"
            disabled={!canEdit}
            value={form.cause_of_death ?? ""}
            onChange={(e) => set("cause_of_death", e.target.value || null)}
          />
        </div>

        <div className="field">
          <label htmlFor="occupation">Profession</label>
          <input
            id="occupation"
            disabled={!canEdit}
            value={form.occupation ?? ""}
            onChange={(e) => set("occupation", e.target.value || null)}
          />
        </div>

        <div className="field">
          <label htmlFor="biography">Notes biographiques</label>
          <textarea
            id="biography"
            rows={4}
            disabled={!canEdit}
            value={form.biography ?? ""}
            onChange={(e) => set("biography", e.target.value || null)}
          />
        </div>

        <div className="field">
          <label htmlFor="photo_url">Photo</label>
          <div className="photo-field">
            {form.photo_url && (
              <img
                src={form.photo_url}
                alt=""
                className="photo-preview"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
            <div className="photo-field-controls">
              <input
                id="photo_url"
                placeholder="URL d'une photo, ou téléversez-en une"
                disabled={!canEdit}
                value={form.photo_url ?? ""}
                onChange={(e) => set("photo_url", e.target.value || null)}
              />
              {canEdit && (
                <label className="btn btn-ghost photo-upload-btn">
                  {uploadingPhoto ? "Envoi…" : "Téléverser…"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {canEdit && (
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : isNew ? "Créer la fiche" : "Enregistrer"}
          </button>
        )}
      </form>

      {!isNew && id && (
        <>
          <ParentsSection
            personId={id}
            personById={personById}
            parentFiliations={myParentFiliations}
            unions={graph?.unions ?? []}
            canEdit={canEdit}
            onChange={refreshGraph}
          />
          <UnionsSection
            personId={id}
            unions={myUnions}
            filiations={graph?.filiations ?? []}
            personById={personById}
            canEdit={canEdit}
            onChange={refreshGraph}
          />
          <DocumentsSection personId={id} canEdit={canEdit} />
          <EventsSection personId={id} personById={personById} canEdit={canEdit} />
          <SourcesSection personId={id} canEdit={canEdit} />
          <ResearchNotesSection personId={id} canEdit={canEdit} />
          <RelationshipCalculator personId={id} />
        </>
      )}
    </div>
  );
}

// ---------- Parents ----------

function ParentsSection({
  personId,
  personById,
  parentFiliations,
  unions,
  canEdit,
  onChange,
}: {
  personId: string;
  personById: Map<string, Person>;
  parentFiliations: TreeGraph["filiations"];
  unions: UnionRecord[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [parent1, setParent1] = useState<PersonSummary | null>(null);
  const [parent2, setParent2] = useState<PersonSummary | null>(null);
  const [unionType, setUnionType] = useState<UnionType>("marriage");
  const [unionDate, setUnionDate] = useState("");
  const [unionPlace, setUnionPlace] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddParents(e: FormEvent) {
    e.preventDefault();
    if (!parent1) return;
    setSaving(true);
    try {
      const union = await createUnion({
        partner1_id: parent1.id,
        partner2_id: parent2?.id ?? null,
        union_type: unionType,
        union_date: unionDate || null,
        union_date_approx: false,
        union_place: unionPlace || null,
        end_date: null,
        end_reason: null,
        notes: null,
      });
      await addChild(union.id, personId);
      setShowForm(false);
      setParent1(null);
      setParent2(null);
      setUnionDate("");
      setUnionPlace("");
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(filiationId: string) {
    if (
      !window.confirm(
        "Retirer ce lien de filiation ? L'union elle-même (et d'éventuels autres enfants) n'est pas supprimée."
      )
    ) {
      return;
    }
    await removeChild(filiationId);
    onChange();
  }

  return (
    <section className="relation-section card">
      <h2>Parents</h2>

      {parentFiliations.length === 0 && <p className="muted">Aucun parent renseigné.</p>}

      {parentFiliations.map((f) => {
        const union = unions.find((u) => u.id === f.union_id);
        const parents = union
          ? [union.partner1_id, union.partner2_id]
              .filter((x): x is string => !!x)
              .map((pid) => personById.get(pid))
              .filter((p): p is Person => !!p)
          : [];
        return (
          <div className="relation-row" key={f.id}>
            <span>
              {parents.length > 0
                ? parents.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && " & "}
                      <Link to={`/fiches/${p.id}`} className="relation-link">
                        {p.first_name} {p.last_name}
                      </Link>
                    </span>
                  ))
                : "Parent(s) inconnu(s)"}
              {union?.union_date && <span className="muted"> · {union.union_date}</span>}
            </span>
            {canEdit && (
              <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleRemove(f.id)}>
                Retirer
              </button>
            )}
          </div>
        );
      })}

      {canEdit &&
        (showForm ? (
          <form onSubmit={handleAddParents} className="relation-add-form">
            <div className="field">
              <label>Premier parent</label>
              <PersonPicker value={parent1} onChange={setParent1} excludeIds={[personId]} />
            </div>
            <div className="field">
              <label>Second parent (optionnel)</label>
              <PersonPicker
                value={parent2}
                onChange={setParent2}
                excludeIds={[personId, ...(parent1 ? [parent1.id] : [])]}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Type d'union</label>
                <select value={unionType} onChange={(e) => setUnionType(e.target.value as UnionType)}>
                  {Object.entries(UNION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date d'union</label>
                <input type="date" value={unionDate} onChange={(e) => setUnionDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Lieu d'union</label>
              <input value={unionPlace} onChange={(e) => setUnionPlace(e.target.value)} />
            </div>
            <div className="relation-add-actions">
              <button className="btn btn-primary" type="submit" disabled={!parent1 || saving}>
                Enregistrer
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(true)}>
            + {parentFiliations.length > 0 ? "Ajouter un autre lien de filiation" : "Renseigner les parents"}
          </button>
        ))}
    </section>
  );
}

// ---------- Unions & children ----------

function UnionsSection({
  personId,
  unions,
  filiations,
  personById,
  canEdit,
  onChange,
}: {
  personId: string;
  unions: UnionRecord[];
  filiations: TreeGraph["filiations"];
  personById: Map<string, Person>;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [showAddUnion, setShowAddUnion] = useState(false);
  const [partner, setPartner] = useState<PersonSummary | null>(null);
  const [unionType, setUnionType] = useState<UnionType>("marriage");
  const [unionDate, setUnionDate] = useState("");
  const [unionPlace, setUnionPlace] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddUnion(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createUnion({
        partner1_id: personId,
        partner2_id: partner?.id ?? null,
        union_type: unionType,
        union_date: unionDate || null,
        union_date_approx: false,
        union_place: unionPlace || null,
        end_date: null,
        end_reason: null,
        notes: null,
      });
      setShowAddUnion(false);
      setPartner(null);
      setUnionDate("");
      setUnionPlace("");
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUnion(unionId: string) {
    if (!window.confirm("Supprimer cette union et les liens de filiation associés ?")) return;
    await deleteUnion(unionId);
    onChange();
  }

  return (
    <section className="relation-section card">
      <h2>Unions et enfants</h2>

      {unions.length === 0 && <p className="muted">Aucune union renseignée.</p>}

      {unions.map((u) => {
        const otherId = u.partner1_id === personId ? u.partner2_id : u.partner1_id;
        const children = filiations.filter((f) => f.union_id === u.id);
        return (
          <UnionBlock
            key={u.id}
            union={u}
            otherPerson={otherId ? personById.get(otherId) : undefined}
            children={children}
            personById={personById}
            unionOwnerId={personId}
            canEdit={canEdit}
            onDeleteUnion={() => handleDeleteUnion(u.id)}
            onChange={onChange}
          />
        );
      })}

      {canEdit &&
        (showAddUnion ? (
          <form onSubmit={handleAddUnion} className="relation-add-form">
            <div className="field">
              <label>Partenaire (laisser vide si inconnu·e)</label>
              <PersonPicker value={partner} onChange={setPartner} excludeIds={[personId]} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Type d'union</label>
                <select value={unionType} onChange={(e) => setUnionType(e.target.value as UnionType)}>
                  {Object.entries(UNION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={unionDate} onChange={(e) => setUnionDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Lieu</label>
              <input value={unionPlace} onChange={(e) => setUnionPlace(e.target.value)} />
            </div>
            <div className="relation-add-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                Ajouter l'union
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowAddUnion(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={() => setShowAddUnion(true)}>
            + Ajouter une union
          </button>
        ))}
    </section>
  );
}

function UnionBlock({
  union,
  otherPerson,
  children,
  personById,
  unionOwnerId,
  canEdit,
  onDeleteUnion,
  onChange,
}: {
  union: UnionRecord;
  otherPerson: Person | undefined;
  children: TreeGraph["filiations"];
  personById: Map<string, Person>;
  unionOwnerId: string;
  canEdit: boolean;
  onDeleteUnion: () => void;
  onChange: () => void;
}) {
  const [showAddChild, setShowAddChild] = useState(false);
  const [child, setChild] = useState<PersonSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const [witnesses, setWitnesses] = useState<UnionWitness[]>([]);
  const [showAddWitness, setShowAddWitness] = useState(false);
  const [witnessPerson, setWitnessPerson] = useState<PersonSummary | null>(null);
  const [witnessRole, setWitnessRole] = useState("Témoin");

  function reloadWitnesses() {
    return listUnionWitnesses(union.id).then(setWitnesses);
  }

  useEffect(() => {
    reloadWitnesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [union.id]);

  async function handleAddWitness(e: FormEvent) {
    e.preventDefault();
    if (!witnessPerson) return;
    setSaving(true);
    try {
      await addUnionWitness(union.id, witnessPerson.id, witnessRole || undefined);
      setWitnessPerson(null);
      setShowAddWitness(false);
      await reloadWitnesses();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveWitness(id: string) {
    await removeUnionWitness(id);
    await reloadWitnesses();
  }

  async function handleAddChild(e: FormEvent) {
    e.preventDefault();
    if (!child) return;
    setSaving(true);
    try {
      await addChild(union.id, child.id);
      setChild(null);
      setShowAddChild(false);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveChild(filiationId: string) {
    await removeChild(filiationId);
    onChange();
  }

  const excludeIds = [unionOwnerId, union.partner1_id, union.partner2_id, ...children.map((c) => c.child_id)].filter(
    (x): x is string => !!x
  );

  return (
    <div className="union-block">
      <div className="union-block-header">
        <span>
          <strong>{UNION_LABELS[union.union_type]}</strong> avec{" "}
          {otherPerson ? (
            <Link to={`/fiches/${otherPerson.id}`} className="relation-link">
              {otherPerson.first_name} {otherPerson.last_name}
            </Link>
          ) : (
            "un·e partenaire inconnu·e"
          )}
          {union.union_date && <span className="muted"> · {union.union_date}</span>}
        </span>
        {canEdit && (
          <button className="btn-ghost person-picker-clear" type="button" onClick={onDeleteUnion}>
            Supprimer
          </button>
        )}
      </div>

      {children.length > 0 && (
        <ul className="children-list">
          {children.map((f) => {
            const c = personById.get(f.child_id);
            return (
              <li key={f.id}>
                {c ? (
                  <Link to={`/fiches/${c.id}`} className="relation-link">
                    {c.first_name} {c.last_name}
                  </Link>
                ) : (
                  "Fiche inconnue"
                )}
                {canEdit && (
                  <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleRemoveChild(f.id)}>
                    Retirer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {witnesses.length > 0 && (
        <ul className="children-list witnesses-list">
          {witnesses.map((w) => {
            const p = personById.get(w.person_id);
            return (
              <li key={w.id}>
                <span className="muted" style={{ fontSize: "0.78rem", marginRight: "0.4rem" }}>
                  {w.role || "Témoin"} :
                </span>
                {p ? (
                  <Link to={`/fiches/${p.id}`} className="relation-link">
                    {p.first_name} {p.last_name}
                  </Link>
                ) : (
                  "Fiche inconnue"
                )}
                {canEdit && (
                  <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleRemoveWitness(w.id)}>
                    Retirer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit &&
        (showAddWitness ? (
          <form onSubmit={handleAddWitness} className="relation-add-form-inline">
            <PersonPicker value={witnessPerson} onChange={setWitnessPerson} placeholder="Choisir le témoin…" />
            <input
              style={{ width: 140 }}
              placeholder="Rôle"
              value={witnessRole}
              onChange={(e) => setWitnessRole(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={!witnessPerson || saving}>
              Ajouter
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowAddWitness(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <button
            className="btn btn-ghost"
            type="button"
            style={{ fontSize: "0.82rem" }}
            onClick={() => setShowAddWitness(true)}
          >
            + Témoin de mariage
          </button>
        ))}

      {canEdit &&
        (showAddChild ? (
          <form onSubmit={handleAddChild} className="relation-add-form-inline">
            <PersonPicker value={child} onChange={setChild} excludeIds={excludeIds} placeholder="Choisir l'enfant…" />
            <button className="btn btn-primary" type="submit" disabled={!child || saving}>
              Ajouter
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowAddChild(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={() => setShowAddChild(true)}>
            + Ajouter un enfant
          </button>
        ))}
    </div>
  );
}

// ---------- Documents ----------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function DocumentsSection({ personId, canEdit }: { personId: string; canEdit: boolean }) {
  const [documents, setDocuments] = useState<PersonDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    return listDocuments(personId)
      .then(setDocuments)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(personId, file);
      await reload();
    } catch (err) {
      setError(extractErrorMessage(err, "Le dépôt du document a échoué."));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer définitivement ce document ?")) return;
    await deleteDocument(id);
    await reload();
  }

  return (
    <section className="relation-section card">
      <h2>Documents</h2>
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Actes, scans, photos d'époque… (PDF, image, Word ou texte, 20 Mo maximum)
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading && <p className="muted">Chargement…</p>}
      {!loading && documents.length === 0 && <p className="muted">Aucun document déposé.</p>}

      {!loading && documents.length > 0 && (
        <ul className="documents-list">
          {documents.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noreferrer" className="relation-link">
                {d.filename}
              </a>
              <span className="muted documents-meta">{formatFileSize(d.size_bytes)}</span>
              {canEdit && (
                <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleDelete(d.id)}>
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <label className="btn btn-ghost" style={{ cursor: "pointer", marginTop: "0.8rem", display: "inline-flex" }}>
          {uploading ? "Envoi…" : "+ Déposer un document"}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
      )}
    </section>
  );
}

// ---------- Events ----------

const EVENT_TYPE_LABELS: Record<string, string> = {
  baptism: "Baptême",
  burial: "Sépulture",
  residence: "Résidence",
  military_service: "Service militaire",
  other: "Autre",
};

const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  godfather: "Parrain",
  godmother: "Marraine",
  witness: "Témoin",
  other: "Autre",
};

function EventsSection({
  personId,
  personById,
  canEdit,
}: {
  personId: string;
  personById: Map<string, Person>;
  canEdit: boolean;
}) {
  const [events, setEvents] = useState<PersonEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [eventType, setEventType] = useState("baptism");
  const [eventDate, setEventDate] = useState("");
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    return listEvents(personId)
      .then(setEvents)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createEvent(personId, {
        event_type: eventType,
        event_date: eventDate || null,
        place: place || null,
        description: description || null,
      });
      setShowForm(false);
      setEventDate("");
      setPlace("");
      setDescription("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer cet événement ?")) return;
    await deleteEvent(id);
    await reload();
  }

  return (
    <section className="relation-section card">
      <h2>Événements</h2>
      {loading && <p className="muted">Chargement…</p>}
      {!loading && events.length === 0 && <p className="muted">Aucun événement renseigné.</p>}
      {events.map((ev) => (
        <EventRow
          key={ev.id}
          event={ev}
          personById={personById}
          canEdit={canEdit}
          onDelete={() => handleDelete(ev.id)}
          onChange={reload}
        />
      ))}

      {canEdit &&
        (showForm ? (
          <form onSubmit={handleAdd} className="relation-add-form">
            <div className="field-row">
              <div className="field">
                <label>Type</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Lieu</label>
              <input value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="relation-add-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                Enregistrer
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(true)}>
            + Ajouter un événement
          </button>
        ))}
    </section>
  );
}

function EventRow({
  event,
  personById,
  canEdit,
  onDelete,
  onChange,
}: {
  event: PersonEvent;
  personById: Map<string, Person>;
  canEdit: boolean;
  onDelete: () => void;
  onChange: () => void;
}) {
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participant, setParticipant] = useState<PersonSummary | null>(null);
  const [role, setRole] = useState<ParticipantRole>("godfather");

  async function handleAddParticipant() {
    if (!participant) return;
    await addEventParticipant(event.id, participant.id, role);
    setParticipant(null);
    setShowAddParticipant(false);
    onChange();
  }

  async function handleRemoveParticipant(id: string) {
    await removeEventParticipant(id);
    onChange();
  }

  return (
    <div className="union-block">
      <div className="union-block-header">
        <span>
          <strong>{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</strong>
          {event.event_date && <span className="muted"> · {event.event_date}</span>}
          {event.place && <span className="muted"> · {event.place}</span>}
        </span>
        {canEdit && (
          <button className="btn-ghost person-picker-clear" type="button" onClick={onDelete}>
            Supprimer
          </button>
        )}
      </div>

      {event.description && (
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
          {event.description}
        </p>
      )}

      {event.participants.length > 0 && (
        <ul className="children-list witnesses-list">
          {event.participants.map((p) => {
            const person = personById.get(p.person_id);
            return (
              <li key={p.id}>
                <span className="muted" style={{ fontSize: "0.78rem", marginRight: "0.4rem" }}>
                  {PARTICIPANT_ROLE_LABELS[p.role]} :
                </span>
                {person ? (
                  <Link to={`/fiches/${person.id}`} className="relation-link">
                    {person.first_name} {person.last_name}
                  </Link>
                ) : (
                  "Fiche inconnue"
                )}
                {canEdit && (
                  <button
                    className="btn-ghost person-picker-clear"
                    type="button"
                    onClick={() => handleRemoveParticipant(p.id)}
                  >
                    Retirer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit &&
        (showAddParticipant ? (
          <div className="relation-add-form-inline" style={{ marginTop: "0.6rem" }}>
            <PersonPicker value={participant} onChange={setParticipant} placeholder="Choisir la personne…" />
            <select value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
              {Object.entries(PARTICIPANT_ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn" type="button" onClick={handleAddParticipant} disabled={!participant}>
              Ajouter
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowAddParticipant(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            type="button"
            style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}
            onClick={() => setShowAddParticipant(true)}
          >
            + Parrain / marraine / témoin
          </button>
        ))}
    </div>
  );
}

// ---------- Sources & citations ----------

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

function SourcesSection({ personId, canEdit }: { personId: string; canEdit: boolean }) {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("medium");
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    return listCitationsForPerson(personId)
      .then(setCitations)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!sourceId) return;
    setSaving(true);
    try {
      await createCitation({ source_id: sourceId, person_id: personId, detail: detail || null, confidence });
      setShowForm(false);
      setSourceId(null);
      setDetail("");
      setConfidence("medium");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteCitation(id);
    await reload();
  }

  return (
    <section className="relation-section card">
      <h2>Sources</h2>
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        D'où viennent ces informations : registre, acte, recensement…
      </p>
      {loading && <p className="muted">Chargement…</p>}
      {!loading && citations.length === 0 && <p className="muted">Aucune source citée.</p>}
      {citations.map((c) => (
        <div className="relation-row" key={c.id}>
          <span>
            <strong>{c.source.title}</strong>
            {c.detail && <span className="muted"> — {c.detail}</span>}
            <span className="muted"> · Fiabilité {CONFIDENCE_LABELS[c.confidence].toLowerCase()}</span>
          </span>
          {canEdit && (
            <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleDelete(c.id)}>
              Retirer
            </button>
          )}
        </div>
      ))}

      {canEdit &&
        (showForm ? (
          <form onSubmit={handleAdd} className="relation-add-form">
            <div className="field">
              <label>Source</label>
              <SourceSelect value={sourceId} onChange={setSourceId} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Détail (n° d'acte, page…)</label>
                <input value={detail} onChange={(e) => setDetail(e.target.value)} />
              </div>
              <div className="field">
                <label>Fiabilité</label>
                <select value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
                  {Object.entries(CONFIDENCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="relation-add-actions">
              <button className="btn btn-primary" type="submit" disabled={!sourceId || saving}>
                Enregistrer
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={() => setShowForm(true)}>
            + Citer une source
          </button>
        ))}
    </section>
  );
}

// ---------- Research notes ----------

function ResearchNotesSection({ personId, canEdit }: { personId: string; canEdit: boolean }) {
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    return listResearchNotes(personId)
      .then(setNotes)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await createResearchNote(personId, text);
      setNewText("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(note: ResearchNote) {
    await updateResearchNote(note.id, { done: !note.done });
    await reload();
  }

  async function handleDelete(id: string) {
    await deleteResearchNote(id);
    await reload();
  }

  return (
    <section className="relation-section card">
      <h2>Pistes de recherche</h2>
      {loading && <p className="muted">Chargement…</p>}
      {!loading && notes.length === 0 && <p className="muted">Aucune piste en cours.</p>}
      {notes.length > 0 && (
        <ul className="research-list">
          {notes.map((n) => (
            <li key={n.id} className={n.done ? "research-done" : ""}>
              <label className="research-checkbox">
                <input type="checkbox" checked={n.done} disabled={!canEdit} onChange={() => toggleDone(n)} />
                <span>{n.text}</span>
              </label>
              {canEdit && (
                <button className="btn-ghost person-picker-clear" type="button" onClick={() => handleDelete(n.id)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
          <input
            style={{ flex: 1 }}
            placeholder="Ex. Vérifier l'acte de naissance aux AD de…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button className="btn" type="submit" disabled={saving || !newText.trim()}>
            Ajouter
          </button>
        </form>
      )}
    </section>
  );
}

// ---------- Relationship calculator ----------

function RelationshipCalculator({ personId }: { personId: string }) {
  const [other, setOther] = useState<PersonSummary | null>(null);
  const [result, setResult] = useState<RelationshipResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePick(p: PersonSummary | null) {
    setOther(p);
    setResult(null);
    if (!p) return;
    setLoading(true);
    try {
      const res = await getRelationship(personId, p.id);
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relation-section card">
      <h2>Lien de parenté</h2>
      <div className="field">
        <label>Calculer le lien avec…</label>
        <PersonPicker value={other} onChange={handlePick} excludeIds={[personId]} />
      </div>
      {loading && <p className="muted">Calcul…</p>}
      {result && (
        <div className="relationship-result">
          <strong>{result.label}</strong>
          <p className="muted" style={{ margin: "0.3rem 0 0", fontSize: "0.85rem" }}>
            {result.path_description}
          </p>
        </div>
      )}
    </section>
  );
}
