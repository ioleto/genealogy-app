import { useEffect, useState } from "react";
import { createSource, listSources } from "../api/client";
import type { Source, SourceType } from "../api/types";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  parish_register: "Registre paroissial",
  civil_record: "Acte d'état civil",
  census: "Recensement",
  correspondence: "Correspondance",
  oral_testimony: "Témoignage oral",
  other: "Autre",
};

interface Props {
  value: string | null;
  onChange: (sourceId: string | null) => void;
}

export default function SourceSelect({ value, onChange }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<SourceType>("civil_record");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSources().then(setSources);
  }, []);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const source = await createSource({ title, source_type: newType });
      setSources((s) => [...s, source].sort((a, b) => a.title.localeCompare(b.title)));
      onChange(source.id);
      setCreating(false);
      setNewTitle("");
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, flex: 2 }}>
          <label>Titre de la source</label>
          <input autoFocus placeholder="Ex. Registres paroissiaux de Nantes" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select value={newType} onChange={(e) => setNewType(e.target.value as SourceType)}>
            {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" onClick={handleCreate} disabled={busy || !newTitle.trim()}>
          Créer
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
          Annuler
        </button>
      </div>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new__") setCreating(true);
        else onChange(e.target.value || null);
      }}
    >
      <option value="">Choisir une source…</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
      <option value="__new__">+ Nouvelle source…</option>
    </select>
  );
}
