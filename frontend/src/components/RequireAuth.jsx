import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="module-card">Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default RequireAuth;
