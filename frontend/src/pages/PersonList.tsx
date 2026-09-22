import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deletePerson, listFamilies, listPersons, updatePerson } from "../api/client";
import type { Family, PersonSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import FamilySelect from "../components/FamilySelect";
import "./PersonList.css";

function formatYear(dateStr: string | null): string {
  if (!dateStr) return "?";
  return dateStr.slice(0, 4);
}

export default function PersonList() {
  const { user } = useAuth();
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const familyById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  function reload() {
    setLoading(true);
    return listPersons(search || undefined, familyFilter || undefined)
      .then(setPersons)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    listFamilies().then(setFamilies);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSelected(new Set());
      reload();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, familyFilter]);

  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => (s.size === persons.length ? new Set() : new Set(persons.map((p) => p.id))));
  }

  async function handleBulkDelete() {
    const count = selected.size;
    if (!window.confirm(`Supprimer définitivement ${count} fiche${count > 1 ? "s" : ""} et leurs liens familiaux ?`)) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    const results = await Promise.allSettled([...selected].map((id) => deletePerson(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setError(`${failed} fiche${failed > 1 ? "s n'ont" : " n'a"} pas pu être supprimée${failed > 1 ? "s" : ""}.`);
    }
    setSelected(new Set());
    setBulkBusy(false);
    await reload();
  }

  async function handleBulkAssign(familyId: string | null) {
    setBulkBusy(true);
    setError(null);
    const results = await Promise.allSettled([...selected].map((id) => updatePerson(id, { family_id: familyId })));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setError(`${failed} fiche${failed > 1 ? "s" : ""} n'ont pas pu être mises à jour.`);
    }
    setSelected(new Set());
    setShowAssign(false);
    setBulkBusy(false);
    await reload();
  }

  const allSelected = persons.length > 0 && selected.size === persons.length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Fiches</h1>
          <p className="muted">{persons.length} personne{persons.length > 1 ? "s" : ""} enregistrée{persons.length > 1 ? "s" : ""}</p>
        </div>
        {canEdit && (
          <Link to="/fiches/nouvelle" className="btn btn-primary">
            + Nouvelle fiche
          </Link>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="person-filters">
        <input
          className="person-search"
          type="search"
          placeholder="Rechercher un nom…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)} className="person-family-filter">
          <option value="">Toutes les familles</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {canEdit && selected.size > 0 && (
        <div className="bulk-bar card">
          <span>{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <div className="bulk-bar-actions">
            {showAssign ? (
              <>
                <FamilySelect value={null} onChange={(v) => handleBulkAssign(v)} disabled={bulkBusy} />
                <button className="btn btn-ghost" type="button" onClick={() => setShowAssign(false)}>
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAssign(true)} disabled={bulkBusy}>
                  Assigner à une famille
                </button>
                <button className="btn btn-danger-text" type="button" onClick={handleBulkDelete} disabled={bulkBusy}>
                  Supprimer la sélection
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="person-table card">
        {!loading && persons.length > 0 && canEdit && (
          <div className="person-row person-row-head">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="muted" style={{ fontSize: "0.8rem" }}>Tout sélectionner</span>
          </div>
        )}
        {loading && <div className="person-row muted">Chargement…</div>}
        {!loading && persons.length === 0 && <div className="person-row muted">Aucune fiche ne correspond.</div>}
        {!loading &&
          persons.map((p) => (
            <div className="person-row" key={p.id}>
              {canEdit && (
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleOne(p.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <Link to={`/fiches/${p.id}`} className="person-row-link">
                <span className="person-name">
                  {p.first_name} {p.last_name}
                  {p.family_id && familyById.get(p.family_id) && (
                    <span className="person-family-badge">{familyById.get(p.family_id)!.name}</span>
                  )}
                </span>
                <span className="muted person-dates">
                  {formatYear(p.birth_date)} – {formatYear(p.death_date)}
                </span>
              </Link>
            </div>
          ))}
      </div>
    </div>
  );
}
