import React, { useState, useEffect } from 'react';
import { patientsAPI } from '../services/api';

const FIELDS = [
  { key: 'weight',              label: 'Masa ciała',       unit: 'kg',    min: 10,  max: 300,  step: 0.1, hint: 'norma: 50–90' },
  { key: 'height',              label: 'Wzrost',           unit: 'cm',    min: 50,  max: 250,  step: 0.1, hint: 'norma: 152–193' },
  { key: 'bmi',                 label: 'BMI',              unit: 'kg/m²', min: 5,   max: 80,   step: 0.1, hint: 'norma: 18.5–25' },
  { key: 'waist_circumference', label: 'Obwód talii',      unit: 'cm',    min: 40,  max: 200,  step: 0.1, hint: 'norma: 60–94' },
  { key: 'hip_circumference',   label: 'Obwód bioder',     unit: 'cm',    min: 50,  max: 200,  step: 0.1, hint: 'norma: 80–115' },
  { key: 'upper_leg_length',    label: 'Długość uda',      unit: 'cm',    min: 10,  max: 80,   step: 0.1, hint: 'norma: 32–50' },
  { key: 'upper_arm_length',    label: 'Długość ramienia', unit: 'cm',    min: 10,  max: 60,   step: 0.1, hint: 'norma: 30–42' },
];

const EMPTY_MEDICAL = Object.fromEntries(FIELDS.map((f) => [f.key, '']));

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function InsertData({ preselectedPatient, onSuccess }) {
  // 'new' | 'existing'
  const [mode, setMode] = useState(preselectedPatient ? 'existing' : 'new');

  // --- nowy pacjent ---
  const [newForm, setNewForm] = useState({ name: '', gender: 'M', exam_date: today(), ...EMPTY_MEDICAL });

  // --- istniejący pacjent ---
  const [patients,        setPatients]        = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(preselectedPatient || null);
  const [examForm,        setExamForm]        = useState({ exam_date: today(), ...EMPTY_MEDICAL });

  const [errors,      setErrors]      = useState({});
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState('');
  const [serverError, setServerError] = useState('');

  // Załaduj pacjentów przy trybie "existing"
  useEffect(() => {
    if (mode === 'existing' && patients.length === 0) {
      setLoadingPatients(true);
      patientsAPI.getAll()
        .then(({ data }) => setPatients(data))
        .finally(() => setLoadingPatients(false));
    }
  }, [mode, patients.length]);

  // Synchronizuj z preselectedPatient
  useEffect(() => {
    if (preselectedPatient) {
      setMode('existing');
      setSelectedPatient(preselectedPatient);
    }
  }, [preselectedPatient]);

  const clearErrors = () => { setErrors({}); setServerError(''); };

  const handleNew = (e) => {
    const { name, value } = e.target;
    setNewForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: '' }));
  };

  const handleExam = (e) => {
    const { name, value } = e.target;
    setExamForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: '' }));
  };

  const validateMedical = (form) => {
    const errs = {};
    FIELDS.forEach(({ key, min, max }) => {
      const v = parseFloat(form[key]);
      if (isNaN(v)) errs[key] = 'Wymagane';
      else if (v < min || v > max) errs[key] = `Zakres: ${min}–${max}`;
    });
    return errs;
  };

  const submitNew = async (e) => {
    e.preventDefault();
    const errs = validateMedical(newForm);
    if (!newForm.name.trim()) errs.name = 'Wymagane';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    clearErrors();
    try {
      const payload = {
        name:       newForm.name.trim(),
        gender:     newForm.gender,
        exam_date:  newForm.exam_date,
      };
      FIELDS.forEach(({ key }) => { payload[key] = parseFloat(newForm[key]); });

      const { data } = await patientsAPI.create(payload);
      setSuccess(`Pacjent dodany pomyślnie! Nadano ID: ${data.patient_id}`);
      setNewForm({ name: '', gender: 'M', exam_date: today(), ...EMPTY_MEDICAL });
      setTimeout(() => { setSuccess(''); onSuccess?.(); }, 2500);
    } catch (err) {
      setServerError(err.response?.data?.error || 'Błąd zapisu');
    } finally {
      setSubmitting(false);
    }
  };

  const submitExam = async (e) => {
    e.preventDefault();
    if (!selectedPatient) { setServerError('Wybierz pacjenta'); return; }
    const errs = validateMedical(examForm);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    clearErrors();
    try {
      const payload = { exam_date: examForm.exam_date };
      FIELDS.forEach(({ key }) => { payload[key] = parseFloat(examForm[key]); });

      await patientsAPI.addExamination(selectedPatient.patient_id, payload);
      setSuccess(`Badanie dodane dla pacjenta ${selectedPatient.name}`);
      setExamForm({ exam_date: today(), ...EMPTY_MEDICAL });
      setTimeout(() => { setSuccess(''); onSuccess?.(); }, 2500);
    } catch (err) {
      setServerError(err.response?.data?.error || 'Błąd zapisu');
    } finally {
      setSubmitting(false);
    }
  };

  const MedicalFields = ({ form, onChange }) => (
    <div className="form-grid">
      {FIELDS.map(({ key, label, unit, min, max, step, hint }) => (
        <div className="form-group" key={key}>
          <label className="form-label">
            {label} <span style={{ color: '#a0aec0', fontWeight: 400 }}>({unit})</span>
          </label>
          <input
            className={`form-input ${errors[key] ? 'error' : ''}`}
            type="number"
            name={key}
            value={form[key]}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            placeholder={hint}
            style={errors[key] ? { borderColor: '#e53e3e' } : {}}
          />
          {errors[key] && (
            <div style={{ color: '#e53e3e', fontSize: '.75rem', marginTop: '.2rem' }}>{errors[key]}</div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="he-info-bar">
        🔐 Wartości zostaną zaszyfrowane schematem CKKS przed wysłaniem do serwera obliczeniowego.
      </div>

      <div className="section-title">Dodaj wpis</div>
      <div className="section-sub">Dane zostaną zaszyfrowane homomorficznie przed zapisem w bazie.</div>

      {/* Przełącznik trybu */}
      <div className="inner-tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`inner-tab ${mode === 'new' ? 'active' : ''}`}
          onClick={() => { setMode('new'); clearErrors(); setSuccess(''); setServerError(''); }}
        >
          👤 Nowy pacjent
        </button>
        <button
          className={`inner-tab ${mode === 'existing' ? 'active' : ''}`}
          onClick={() => { setMode('existing'); clearErrors(); setSuccess(''); setServerError(''); }}
        >
          📋 Dodaj badanie do istniejącego
        </button>
      </div>

      {success     && <div className="alert alert-success">✅ {success}</div>}
      {serverError && <div className="alert alert-danger">{serverError}</div>}

      {/* ── NOWY PACJENT ── */}
      {mode === 'new' && (
        <form onSubmit={submitNew}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Dane osobowe</span>
              <span className="badge badge-info">ID nadawane automatycznie</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Imię i nazwisko</label>
                <input
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  name="name"
                  value={newForm.name}
                  onChange={handleNew}
                  placeholder="Jan Kowalski"
                  style={errors.name ? { borderColor: '#e53e3e' } : {}}
                />
                {errors.name && <div style={{ color: '#e53e3e', fontSize: '.8rem', marginTop: '.3rem' }}>{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Płeć</label>
                <select className="form-select" name="gender" value={newForm.gender} onChange={handleNew}>
                  <option value="M">Mężczyzna</option>
                  <option value="F">Kobieta</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data badania</label>
                <input className="form-input" type="date" name="exam_date" value={newForm.exam_date} onChange={handleNew} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Parametry medyczne</span>
              <span className="badge badge-info">🔐 zostaną zaszyfrowane</span>
            </div>
            <MedicalFields form={newForm} onChange={handleNew} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button" className="btn btn-secondary"
              onClick={() => setNewForm({ name: '', gender: 'M', exam_date: today(), ...EMPTY_MEDICAL })}
            >
              Wyczyść
            </button>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
              {submitting ? '⏳ Szyfrowanie i zapis...' : '🔐 Zaszyfruj i zapisz'}
            </button>
          </div>
        </form>
      )}

      {/* ── ISTNIEJĄCY PACJENT ── */}
      {mode === 'existing' && (
        <form onSubmit={submitExam}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Wybierz pacjenta</span>
            </div>

            {loadingPatients ? (
              <div className="loading-center" style={{ padding: '1rem' }}>
                <div className="spinner" /><div>Ładowanie listy pacjentów...</div>
              </div>
            ) : (
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Pacjent</label>
                  <select
                    className="form-select"
                    value={selectedPatient?.patient_id || ''}
                    onChange={(e) => {
                      const p = patients.find((x) => x.patient_id === e.target.value) || null;
                      setSelectedPatient(p);
                    }}
                  >
                    <option value="">— wybierz pacjenta —</option>
                    {patients.map((p) => (
                      <option key={p.patient_id} value={p.patient_id}>
                        {p.patient_id} — {p.name} ({p.gender === 'M' ? '♂' : '♀'}) · {p.exam_count} badań
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPatient && (
                  <div className="form-group">
                    <label className="form-label">Data badania</label>
                    <input
                      className="form-input"
                      type="date"
                      name="exam_date"
                      value={examForm.exam_date}
                      onChange={handleExam}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedPatient && (
            <>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">
                    Nowe badanie — {selectedPatient.name}
                  </span>
                  <span className="badge badge-info">🔐 zostaną zaszyfrowane</span>
                </div>
                <MedicalFields form={examForm} onChange={handleExam} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button" className="btn btn-secondary"
                  onClick={() => setExamForm({ exam_date: today(), ...EMPTY_MEDICAL })}
                >
                  Wyczyść
                </button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
                  {submitting ? '⏳ Szyfrowanie i zapis...' : '🔐 Zaszyfruj i zapisz badanie'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
