import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPersons } from "../api/client";
import type { PersonSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import "./PersonList.css";

function formatYear(dateStr: string | null): string {
  if (!dateStr) return "?";
  return dateStr.slice(0, 4);
}

export default function PersonList() {
  const { user } = useAuth();
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const canEdit = user?.role === "admin" || user?.role === "editor";

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      listPersons(search || undefined)
        .then(setPersons)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

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

      <input
        className="person-search"
        type="search"
        placeholder="Rechercher un nom…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="person-table card">
        {loading && <div className="person-row muted">Chargement…</div>}
        {!loading && persons.length === 0 && <div className="person-row muted">Aucune fiche ne correspond.</div>}
        {!loading &&
          persons.map((p) => (
            <Link to={`/fiches/${p.id}`} key={p.id} className="person-row">
              <span className="person-name">
                {p.first_name} {p.last_name}
              </span>
              <span className="muted person-dates">
                {formatYear(p.birth_date)} – {formatYear(p.death_date)}
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
