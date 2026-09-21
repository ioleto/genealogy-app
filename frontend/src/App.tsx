import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import PersonList from "./pages/PersonList";
import PersonForm from "./pages/PersonForm";
import TreeView from "./pages/TreeView";
import SettingsPage from "./pages/SettingsPage";
import UsersAdmin from "./pages/UsersAdmin";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Chargement…</div>;
  if (!user) return <Navigate to="/connexion" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/arbre" replace />} />
        <Route path="/arbre" element={<TreeView />} />
        <Route path="/fiches" element={<PersonList />} />
        <Route path="/fiches/nouvelle" element={<PersonForm />} />
        <Route path="/fiches/:id" element={<PersonForm />} />
        <Route path="/utilisateurs" element={<UsersAdmin />} />
        <Route path="/parametres" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
