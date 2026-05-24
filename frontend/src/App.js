import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Navbar from './components/Navbar';
import PatientRecords from './components/PatientRecords';
import InsertData from './components/InsertData';
import Analytics from './components/Analytics';

export default function App() {
  const [token,      setToken]      = useState(localStorage.getItem('token'));
  const [doctorName, setDoctorName] = useState(localStorage.getItem('doctorName') || '');
  const [activeTab,  setActiveTab]  = useState('patients');
  // Pacjent przekazany do InsertData (tryb "dodaj badanie")
  const [insertPatient, setInsertPatient] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('doctorName', doctorName);
    }
  }, [token, doctorName]);

  const handleLogin  = (tok, name) => { setToken(tok); setDoctorName(name); };
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('doctorName');
    setToken(null);
    setDoctorName('');
  };

  const navigateToAddExam = (patient) => {
    setInsertPatient(patient);
    setActiveTab('insert');
  };

  const handleTabChange = (tab) => {
    if (tab !== 'insert') setInsertPatient(null);
    setActiveTab(tab);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div className="app-layout">
      <Navbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        doctorName={doctorName}
        onLogout={handleLogout}
      />
      <main className="app-content">
        {activeTab === 'patients'  && <PatientRecords onAddExam={navigateToAddExam} />}
        {activeTab === 'insert'    && (
          <InsertData
            preselectedPatient={insertPatient}
            onSuccess={() => { setInsertPatient(null); setActiveTab('patients'); }}
          />
        )}
        {activeTab === 'analytics' && <Analytics />}
      </main>
    </div>
  );
}
