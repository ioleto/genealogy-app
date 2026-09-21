import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./Layout.css";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <span className="shell-brand-mark" aria-hidden="true" />
          <span className="shell-brand-name">Arbre&nbsp;Généalogique</span>
        </div>

        <nav className="shell-nav">
          <NavLink to="/arbre" className={({ isActive }) => (isActive ? "active" : "")}>
            Arbre
          </NavLink>
          <NavLink to="/fiches" className={({ isActive }) => (isActive ? "active" : "")}>
            Fiches
          </NavLink>
          {user?.role === "admin" && (
            <NavLink to="/utilisateurs" className={({ isActive }) => (isActive ? "active" : "")}>
              Utilisateurs
            </NavLink>
          )}
          <NavLink to="/parametres" className={({ isActive }) => (isActive ? "active" : "")}>
            Paramètres
          </NavLink>
        </nav>

        <div className="shell-user">
          <div className="shell-user-name">{user?.full_name}</div>
          <div className="shell-user-role muted">
            {user?.role === "admin" ? "Administrateur" : user?.role === "editor" ? "Contributeur" : "Lecteur"}
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ marginTop: 8, width: "100%" }}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
