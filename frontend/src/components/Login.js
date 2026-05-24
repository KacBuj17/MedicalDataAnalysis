import React, { useState } from 'react';
import { authAPI } from '../services/api';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authAPI.login(form.username, form.password);
      onLogin(data.token, data.name);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd logowania');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">🏥</div>
          <h1>MedAnalytics HE</h1>
          <p>Platforma analizy danych medycznych</p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span className="he-badge">
            🔐 Szyfrowanie homomorficzne CKKS
          </span>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Login lekarza</label>
            <input
              className="form-input"
              name="username"
              placeholder="np. dr_kowalski"
              value={form.username}
              onChange={handle}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hasło</label>
            <input
              className="form-input"
              name="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handle}
              required
            />
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

          <button className="btn btn-primary" disabled={loading}>
            {loading ? '⏳ Logowanie...' : '→ Zaloguj się'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '8px', fontSize: '.8rem', color: '#718096' }}>
          <strong>Demo:</strong><br />
          Login: <code>dr_kowalski</code> / Hasło: <code>Doctor123!</code>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '.75rem', color: '#a0aec0', textAlign: 'center', lineHeight: 1.5 }}>
          Wszystkie dane medyczne są szyfrowane schematem CKKS.<br />
          Klucz tajny posiada wyłącznie lekarz.
        </div>
      </div>
    </div>
  );
}
