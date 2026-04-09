import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { extractApiError } from "../api/client";
import brandLogo from "../assets/company logo.png";
import { getFirstAccessiblePath } from "../utils/rbac";

function SignupPage() {
  const navigate = useNavigate();
  const { signup, setup, setupLoading, setupError, setupFallbackMode, user, defaultPath } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(defaultPath || "/", { replace: true });
    }
  }, [defaultPath, navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!form.name || !form.email || !form.password) {
      setError("Please complete all required fields.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const data = await signup(
        { name: form.name, email: form.email, password: form.password, phone: form.phone },
        { autoLogin: true },
      );
      navigate(getFirstAccessiblePath(data?.user?.permissions || {}) || "/", { replace: true });
    } catch (err) {
      setError(extractApiError(err, "Signup failed."));
    } finally {
      setLoading(false);
    }
  };

  const showSignupForm = !setupLoading && (setup.allowPublicSignup || setupFallbackMode);
  const statusMessage = setupLoading
    ? "Checking workspace setup..."
    : setupFallbackMode
      ? "Signup availability could not be verified, but you can still try creating the first account."
    : setupError
      ? "Unable to verify signup setup right now. Please check backend connectivity and try again."
      : "Admin account is already configured. Sign in and create users from Settings > Users.";

  return (
    <div className="auth-shell">
      <button
        className="auth-theme-toggle"
        onClick={toggleMode}
        title={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
      >
        {mode === "light" ? <Moon size={20} /> : <Sun size={20} />}
      </button>
      <div className="auth-card">
        <div className="auth-header">
          <img className="auth-logo" src={brandLogo} alt="China Bedsheet Store" />
        </div>

        {showSignupForm ? (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-grid">
              <label>
                Full Name
                <input
                  type="text"
                  placeholder="Muhammad Ali"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  placeholder="03xx-xxxxxxx"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
            </div>
            <label>
              Email
              <input
                type="email"
                placeholder="admin@china-bedsheet.com"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <div className="auth-grid">
              <label>
                Password
                <div className="auth-password">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create password"
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
              <label>
                Confirm Password
                <div className="auth-password">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  />
                  <button
                    type="button"
                    className="auth-toggle"
                    onClick={() => setShowConfirm((prev) => !prev)}
                  >
                    {showConfirm ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Creating admin..." : "Create admin account"}
            </button>
          </form>
        ) : (
          <div className="auth-form">
            <div className="auth-error">{statusMessage}</div>
          </div>
        )}

        <div className="auth-footer">
          <span>{showSignupForm ? "Already have an account?" : "Continue with existing admin account."}</span>
          <NavLink to="/login" className="auth-link">
            Sign in
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
