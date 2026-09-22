import { useEffect, useRef, useState } from "react";
import { listPersons } from "../api/client";
import type { PersonSummary } from "../api/types";
import "./PersonPicker.css";

interface Props {
  value: PersonSummary | null;
  onChange: (person: PersonSummary | null) => void;
  excludeIds?: string[];
  placeholder?: string;
  /** Reste toujours en mode recherche, même une fois une valeur choisie —
   * utile pour un sélecteur qui sert à CHANGER la sélection courante
   * (ex. « centrer l'arbre sur… ») plutôt qu'à la définir une seule fois
   * puis la verrouiller (usage par défaut, ex. choisir un conjoint). */
  alwaysSearchable?: boolean;
}

export default function PersonPicker({ value, onChange, excludeIds = [], placeholder, alwaysSearchable = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      listPersons(query || undefined).then((res) =>
        setResults(res.filter((p) => !excludeIds.includes(p.id)))
      );
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  if (value && !alwaysSearchable) {
    return (
      <div className="person-picker person-picker-chosen">
        <span>
          {value.first_name} {value.last_name}
        </span>
        <button type="button" className="btn-ghost person-picker-clear" onClick={() => onChange(null)}>
          Retirer
        </button>
      </div>
    );
  }

  return (
    <div className="person-picker" ref={containerRef}>
      <input
        type="text"
        placeholder={placeholder ?? "Rechercher une fiche…"}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && results.length > 0 && (
        <ul className="person-picker-results">
          {results.map((p) => (
            <li
              key={p.id}
              onClick={() => {
                onChange(p);
                setOpen(false);
                setQuery("");
              }}
            >
              {p.first_name} {p.last_name}
              {p.birth_date && <span className="muted"> · né(e) {p.birth_date.slice(0, 4)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
