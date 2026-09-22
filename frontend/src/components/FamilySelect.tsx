import { useEffect, useState } from "react";
import { createFamily, listFamilies } from "../api/client";
import type { Family } from "../api/types";

interface Props {
  value: string | null;
  onChange: (familyId: string | null) => void;
  disabled?: boolean;
}

export default function FamilySelect({ value, onChange, disabled }: Props) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listFamilies().then(setFamilies);
  }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const family = await createFamily(name);
      setFamilies((f) => [...f, family].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(family.id);
      setCreating(false);
      setNewName("");
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          autoFocus
          placeholder="Nom de la nouvelle famille"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        <button type="button" className="btn" onClick={handleCreate} disabled={busy || !newName.trim()}>
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
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCreating(true);
        } else {
          onChange(e.target.value || null);
        }
      }}
    >
      <option value="">Aucune famille déclarée</option>
      {families.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      {!disabled && <option value="__new__">+ Nouvelle famille…</option>}
    </select>
  );
}
