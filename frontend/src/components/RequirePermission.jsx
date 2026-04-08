import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function RequirePermission({ permission, anyOf, children }) {
  const { user, loading, hasPermission, hasAnyPermission, defaultPath } = useAuth();

  if (loading) {
    return <div className="module-card">Checking access...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowed = permission ? hasPermission(permission) : hasAnyPermission(anyOf);
  if (allowed) {
    return children;
  }

  if (defaultPath && defaultPath !== "/") {
    return <Navigate to={defaultPath} replace />;
  }

  return <div className="module-card">Access denied for this module.</div>;
}

export default RequirePermission;
