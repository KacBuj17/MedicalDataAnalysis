import React from 'react';

const TABS = [
  { id: 'patients',  label: '📋 Pacjenci' },
  { id: 'insert',    label: '➕ Nowy wpis' },
  { id: 'analytics', label: '📊 Analizy' },
];

export default function Navbar({ activeTab, onTabChange, doctorName, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="lock-icon">🔐</span>
        <span>MedAnalytics HE</span>
      </div>

      <div className="navbar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="navbar-right">
        <span className="doctor-info">👨‍⚕️ {doctorName}</span>
        <button className="btn-logout" onClick={onLogout}>Wyloguj</button>
      </div>
    </nav>
  );
}
