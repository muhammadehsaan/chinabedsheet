import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { extractApiError } from "../api/client";
import brandLogo from "../assets/company logo.png";
import { getFirstAccessiblePath } from "../utils/rbac";



function LoginPage() {
  const navigate = useNavigate();
  const { login, setup, setupLoading, setupError, setupFallbackMode } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await login({ email: form.email, password: form.password });
      navigate(getFirstAccessiblePath(data?.user?.permissions || {}) || "/", { replace: true });
    } catch (err) {
      setError(extractApiError(err, "Login failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <button 
        className="auth-theme-toggle" 
        onClick={toggleMode}
        title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      >
        {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      </button>
      <div className="auth-card">
        <div className="auth-header">
          <img className="auth-logo" src={brandLogo} alt="China Bedsheet Store" />
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email / Username
            <input
              type="text"
              placeholder="admin@china-bedsheet.com"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Password
            <div className="auth-password">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>



          <div className="auth-row">
            <label className="auth-check">
              <input type="checkbox" defaultChecked />
              Remember me
            </label>
            <button type="button" className="auth-link">
              Forgot password?
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="auth-footer">
          {setupLoading ? (
            <span>Checking account setup...</span>
          ) : setupFallbackMode ? (
            <>
              <span>Create account setup check is unavailable.</span>
              <NavLink to="/signup" className="auth-link">
                Try create account
              </NavLink>
            </>
          ) : setupError ? (
            <span>Unable to verify account setup right now. Please check backend connectivity.</span>
          ) : setup.allowPublicSignup ? (
            <>
              <span>New here?</span>
              <NavLink to="/signup" className="auth-link">
                Create first admin account
              </NavLink>
            </>
          ) : (
            <span>Admin account is already configured. Sign in to continue.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
