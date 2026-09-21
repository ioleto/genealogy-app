import { ChangeEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, useTheme } from "../theme/ThemeContext";
import { exportGedcom, extractErrorMessage, importGedcom, type GedcomImportResult } from "../api/client";

const PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: "Pin & laiton", primary: "#2f5d50", secondary: "#b08d57" },
  { name: "Ardoise & rouille", primary: "#3a4a5c", secondary: "#b0623f" },
  { name: "Bordeaux & sable", primary: "#6b2d3c", secondary: "#c9a86a" },
  { name: "Encre & sauge", primary: "#22303a", secondary: "#7c9070" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const { primary, secondary, setColors } = useTheme();
  const [draftPrimary, setDraftPrimary] = useState(primary);
  const [draftSecondary, setDraftSecondary] = useState(secondary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [gedcomError, setGedcomError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<GedcomImportResult | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setColors(draftPrimary, draftSecondary);
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer les couleurs."));
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(p: { primary: string; secondary: string }) {
    setDraftPrimary(p.primary);
    setDraftSecondary(p.secondary);
  }

  function resetDefaults() {
    setDraftPrimary(DEFAULT_PRIMARY);
    setDraftSecondary(DEFAULT_SECONDARY);
  }

  async function handleExport() {
    setExporting(true);
    setGedcomError(null);
    try {
      await exportGedcom();
    } catch (err) {
      setGedcomError(extractErrorMessage(err, "L'export GEDCOM a échoué."));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setGedcomError(null);
    setImportResult(null);
    try {
      const result = await importGedcom(file);
      setImportResult(result);
    } catch (err) {
      setGedcomError(extractErrorMessage(err, "L'import GEDCOM a échoué."));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Paramètres</h1>
          <p className="muted">Connecté·e en tant que {user?.email}</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="card" style={{ padding: "1.6rem 1.8rem", maxWidth: 520 }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.4rem" }}>Couleurs de l'arbre</h2>
        <p className="muted" style={{ fontSize: "0.86rem", marginTop: 0, marginBottom: "1.2rem" }}>
          La couleur principale marque la lignée directe dans l'arbre ; la couleur secondaire marque les
          conjoint·e·s et unions par alliance.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="primary">Couleur principale</label>
            <input
              id="primary"
              type="color"
              value={draftPrimary}
              onChange={(e) => setDraftPrimary(e.target.value)}
              style={{ height: 42, padding: 4 }}
            />
          </div>
          <div className="field">
            <label htmlFor="secondary">Couleur secondaire</label>
            <input
              id="secondary"
              type="color"
              value={draftSecondary}
              onChange={(e) => setDraftSecondary(e.target.value)}
              style={{ height: 42, padding: 4 }}
            />
          </div>
        </div>

        <div className="field">
          <label>Palettes suggérées</label>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn"
                onClick={() => applyPreset(p)}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span style={{ display: "flex" }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: p.primary }} />
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: p.secondary, marginLeft: 2 }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.4rem" }}>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={resetDefaults}>
            Réinitialiser
          </button>
          {saved && <span className="muted" style={{ alignSelf: "center", fontSize: "0.85rem" }}>Enregistré.</span>}
        </div>
      </section>

      <section className="card" style={{ padding: "1.6rem 1.8rem", maxWidth: 520, marginTop: "1.4rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.4rem" }}>Import / Export GEDCOM</h2>
        <p className="muted" style={{ fontSize: "0.86rem", marginTop: 0, marginBottom: "1.2rem" }}>
          GEDCOM est le format standard reconnu par la quasi-totalité des logiciels de généalogie
          (Gramps, Geneanet, MyHeritage, Ancestry, FamilySearch…), pour sauvegarder ou transférer un arbre.
        </p>

        {gedcomError && <div className="error-banner">{gedcomError}</div>}

        {importResult && (
          <div className="card" style={{ padding: "0.8em 1em", marginBottom: "1.1rem", fontSize: "0.86rem" }}>
            Import terminé : {importResult.persons} fiche{importResult.persons > 1 ? "s" : ""}, {importResult.unions}{" "}
            union{importResult.unions > 1 ? "s" : ""}, {importResult.filiations} filiation
            {importResult.filiations > 1 ? "s" : ""} créée{importResult.filiations > 1 ? "s" : ""}.
            {importResult.skipped_unions > 0 && (
              <> {importResult.skipped_unions} union{importResult.skipped_unions > 1 ? "s" : ""} en doublon ignorée
              {importResult.skipped_unions > 1 ? "s" : ""}.</>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Export…" : "Exporter en .ged"}
          </button>

          {canEdit && (
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              {importing ? "Import…" : "Importer un fichier .ged"}
              <input
                type="file"
                accept=".ged,text/plain"
                style={{ display: "none" }}
                disabled={importing}
                onChange={handleImport}
              />
            </label>
          )}
        </div>

        {canEdit && (
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.9rem", marginBottom: 0 }}>
            L'import ajoute toujours de <strong>nouvelles</strong> fiches — il ne cherche pas à fusionner avec
            l'existant. À réserver à un import initial, ou à faire sur un arbre vide.
          </p>
        )}
      </section>
    </div>
  );
}
