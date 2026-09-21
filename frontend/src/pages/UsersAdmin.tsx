import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { createUser, extractErrorMessage, listUsers, updateUser } from "../api/client";
import type { User, UserRole } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import "./UsersAdmin.css";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  editor: "Contributeur",
  viewer: "Lecteur",
};

export default function UsersAdmin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("editor");
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible de charger les utilisateurs."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (currentUser && currentUser.role !== "admin") {
    return <Navigate to="/arbre" replace />;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser({ email, password, full_name: fullName, role });
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("editor");
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible de créer le compte."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    await updateUser(u.id, { is_active: !u.is_active });
    await reload();
  }

  async function changeRole(u: User, newRole: UserRole) {
    await updateUser(u.id, { role: newRole });
    await reload();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Utilisateurs</h1>
          <p className="muted">Comptes ayant accès à l'arbre familial</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)} type="button">
          {showForm ? "Annuler" : "+ Inviter un compte"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card users-add-form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="new-name">Nom complet</label>
              <input id="new-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="new-password">Mot de passe provisoire</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-role">Rôle</label>
              <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="viewer">Lecteur — consultation uniquement</option>
                <option value="editor">Contributeur — peut modifier l'arbre</option>
                <option value="admin">Administrateur — gère aussi les comptes</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Création…" : "Créer le compte"}
          </button>
        </form>
      )}

      <div className="card users-table">
        {loading && <div className="users-row muted">Chargement…</div>}
        {!loading &&
          users.map((u) => (
            <div className="users-row" key={u.id}>
              <div>
                <div className="users-name">{u.full_name}</div>
                <div className="muted users-email">{u.email}</div>
              </div>
              <select
                value={u.role}
                disabled={u.id === currentUser?.id}
                onChange={(e) => changeRole(u, e.target.value as UserRole)}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={u.id === currentUser?.id}
                onClick={() => toggleActive(u)}
              >
                {u.is_active ? "Désactiver" : "Réactiver"}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
