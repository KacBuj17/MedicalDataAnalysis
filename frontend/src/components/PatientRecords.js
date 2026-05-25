import React, { useState, useEffect, useCallback } from 'react';
import { patientsAPI } from '../services/api';

const FIELD_META = {
  weight:              { label: 'Masa ciała',       unit: 'kg',    normal: [50, 90]    },
  height:              { label: 'Wzrost',           unit: 'cm',    normal: [152, 193]  },
  bmi:                 { label: 'BMI',              unit: 'kg/m²', normal: [18.5, 25]  },
  waist_circumference: { label: 'Obwód talii',      unit: 'cm',    normal: [60, 94]    },
  hip_circumference:   { label: 'Obwód bioder',     unit: 'cm',    normal: [80, 115]   },
  upper_leg_length:    { label: 'Długość uda',      unit: 'cm',    normal: [32, 50]    },
  upper_arm_length:    { label: 'Długość ramienia', unit: 'cm',    normal: [30, 42]    },
};


function statusClass(field, val) {
  const meta = FIELD_META[field];
  if (!meta || val === undefined) return '';
  const [lo, hi] = meta.normal;
  if (val < lo || val > hi) return 'danger';
  const margin = (hi - lo) * 0.1;
  if (val < lo + margin || val > hi - margin) return 'warning';
  return 'normal';
}

function anomalyCount(exam) {
  return Object.keys(FIELD_META).filter((f) => statusClass(f, exam[f]) === 'danger').length;
}

// ── Widok szczegółowy pacjenta ─────────────────────────────────────────────
function PatientDetail({ patient, onBack, onAddExam }) {
  const [exams,    setExams]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [deleting, setDeleting] = useState(null); // exam_id being deleted
  const [delPatient, setDelPatient] = useState(false);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await patientsAPI.getExaminations(patient.patient_id);
      setExams(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd ładowania badań');
    } finally {
      setLoading(false);
    }
  }, [patient.patient_id]);

  useEffect(() => { loadExams(); }, [loadExams]);

  const handleDeleteExam = async (examId) => {
    if (!window.confirm('Usunąć to badanie?')) return;
    setDeleting(examId);
    try {
      await patientsAPI.deleteExamination(examId);
      setExams((prev) => prev.filter((e) => e.exam_id !== examId));
    } catch (err) {
      alert(err.response?.data?.error || 'Błąd usuwania');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeletePatient = async () => {
    if (!window.confirm(`Usunąć pacjenta ${patient.name} i wszystkie jego badania?`)) return;
    setDelPatient(true);
    try {
      await patientsAPI.delete(patient.patient_id);
      onBack(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Błąd usuwania');
      setDelPatient(false);
    }
  };

  return (
    <div>
      {/* Nagłówek */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onBack(false)}>
          ← Powrót
        </button>
        <div>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {patient.gender === 'M' ? '♂' : '♀'} {patient.name}
          </div>
          <div style={{ fontSize: '.82rem', color: '#718096' }}>
            ID: {patient.patient_id} &nbsp;·&nbsp; {exams.length} badań
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.75rem' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onAddExam(patient)}>
            + Dodaj badanie
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleDeletePatient} disabled={delPatient}>
            {delPatient ? '⏳' : '🗑 Usuń pacjenta'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <div>Odszyfrowywanie badań CKKS...</div>
        </div>
      ) : exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
          Brak badań dla tego pacjenta.
        </div>
      ) : (
        exams.map((exam) => {
          const anom = anomalyCount(exam);
          return (
            <div key={exam.exam_id} className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <strong style={{ fontSize: '1rem' }}>
                    Badanie z dnia {exam.exam_date || '—'}
                  </strong>
                  <span style={{ fontSize: '.75rem', color: '#a0aec0', marginLeft: '.75rem' }}>
                    {exam.exam_id}
                  </span>
                  {anom > 0 && (
                    <span className="badge badge-danger" style={{ marginLeft: '.75rem' }}>
                      ⚠ {anom} poza normą
                    </span>
                  )}
                  {anom === 0 && (
                    <span className="badge badge-normal" style={{ marginLeft: '.75rem' }}>✓ OK</span>
                  )}
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteExam(exam.exam_id)}
                  disabled={deleting === exam.exam_id}
                >
                  {deleting === exam.exam_id ? '⏳' : '🗑'}
                </button>
              </div>

              <div className="detail-grid">
                {Object.entries(FIELD_META).map(([field, meta]) => {
                  const val = exam[field];
                  if (val === undefined) return null;
                  const cls = statusClass(field, val);
                  return (
                    <div key={field} className={`detail-item ${cls}`}>
                      <div className="detail-label">{meta.label}</div>
                      <div className="detail-value">
                        {typeof val === 'number' ? val.toLocaleString('pl-PL') : val}
                        <span className="detail-unit"> {meta.unit}</span>
                      </div>
                      <div style={{ fontSize: '.7rem', color: '#a0aec0', marginTop: '.15rem' }}>
                        norma: {meta.normal[0]}–{meta.normal[1]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Lista pacjentów ────────────────────────────────────────────────────────
export default function PatientRecords({ onAddExam }) {
  const [patients,  setPatients]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await patientsAPI.getAll();
      setPatients(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd ładowania danych');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleBack = (didDelete) => {
    setSelected(null);
    if (didDelete) load();
  };

  if (selected) {
    return (
      <PatientDetail
        patient={selected}
        onBack={handleBack}
        onAddExam={onAddExam}
      />
    );
  }

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.patient_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="he-info-bar">
        🔐 Dane medyczne przechowywane są zaszyfrowane (CKKS). Odszyfrowywanie następuje po stronie lekarza przy otwieraniu badania.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Baza pacjentów</div>
          <div className="section-sub">
            {loading ? 'Ładowanie...' : `${patients.length} pacjentów`}
          </div>
        </div>
        <input
          className="search-bar"
          placeholder="🔍 Szukaj po nazwisku lub ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <div>Ładowanie listy pacjentów...</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pacjent</th>
                  <th>Płeć</th>
                  <th>Liczba badań</th>
                  <th>Ostatnie badanie</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.patient_id}
                    onClick={() => setSelected(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><code style={{ fontSize: '.8rem' }}>{p.patient_id}</code></td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.gender === 'M' ? '♂' : '♀'}</td>
                    <td>
                      <span className="badge badge-info">{p.exam_count}</span>
                    </td>
                    <td style={{ color: '#718096', fontSize: '.85rem' }}>
                      {p.last_exam_date || '—'}
                    </td>
                    <td>
                      <span style={{ color: '#1565c0', fontSize: '.82rem' }}>
                        Zobacz badania →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
              {search ? `Brak wyników dla „${search}"` : 'Brak pacjentów w bazie'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
