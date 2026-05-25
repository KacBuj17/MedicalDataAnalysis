import React, { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, Legend,
} from 'recharts';
import { analyzeAPI } from '../services/api';

const FIELDS = [
  { key: 'weight',              label: 'Masa ciała',       unit: 'kg'    },
  { key: 'height',              label: 'Wzrost',           unit: 'cm'    },
  { key: 'bmi',                 label: 'BMI',              unit: 'kg/m²' },
  { key: 'waist_circumference', label: 'Obwód talii',      unit: 'cm'    },
  { key: 'hip_circumference',   label: 'Obwód bioder',     unit: 'cm'    },
  { key: 'upper_leg_length',    label: 'Długość uda',      unit: 'cm'    },
  { key: 'upper_arm_length',    label: 'Długość ramienia', unit: 'cm'    },
];

const PROFILE_FIELDS = FIELDS;

const COMPARE_DEFAULTS = {
  weight: 75.0,
  height: 170.0,
  bmi: 26.0,
  waist_circumference: 85.0,
  hip_circumference: 100.0,
  upper_leg_length: 40.0,
  upper_arm_length: 36.0,
};

function severityColor(s) {
  if (s === 'normal') return '#38a169';
  if (s === 'warning') return '#dd6b20';
  return '#e53e3e';
}

// ── Histogram helper ─────────────────────────────────────────────────────────
function buildHistogram(values, bins = 15) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  values.forEach((v) => {
    const i = Math.min(Math.floor((v - min) / width), bins - 1);
    counts[i]++;
  });
  return counts.map((count, i) => ({
    range: `${(min + i * width).toFixed(1)}`,
    count,
    x: min + i * width,
  }));
}

// ── Population Statistics Panel ───────────────────────────────────────────────
function PopulationStats() {
  const [field, setField] = useState('bmi');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    setStats(null);
    try {
      const { data } = await analyzeAPI.statistics(f);
      setStats(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd pobierania statystyk');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleField = (e) => {
    const f = e.target.value;
    setField(f);
    load(f);
  };

  const histData = stats ? buildHistogram(stats.values) : [];

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Statystyki populacji</span>
          <select className="form-select" style={{ width: '240px' }} value={field} onChange={handleField}>
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>{f.label} ({f.unit})</option>
            ))}
          </select>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          🔐 Obliczenia wykonywane na <strong>zaszyfrowanych danych</strong> (suma, suma kwadratów) — serwer obliczeniowy nie widzi wartości w postaci jawnej.
          Lekarz odszyfrowuje wyniki kluczem tajnym.
        </div>

        {!stats && !loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
            Wybierz parametr, aby załadować statystyki.
          </div>
        )}

        {loading && (
          <div className="loading-center">
            <div className="spinner" />
            <div>Obliczanie na danych zaszyfrowanych...</div>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {stats && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Liczba pacjentów</div>
                <div className="stat-value">{stats.count}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Średnia</div>
                <div className="stat-value">{stats.mean}</div>
                <div className="stat-unit">{stats.unit}</div>
              </div>
              <div className="stat-card orange">
                <div className="stat-label">Odchylenie std.</div>
                <div className="stat-value">{stats.std}</div>
                <div className="stat-unit">{stats.unit}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Min / Max</div>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>{stats.min} / {stats.max}</div>
                <div className="stat-unit">{stats.unit}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Mediana (P50)</div>
                <div className="stat-value">{stats.median}</div>
                <div className="stat-unit">{stats.unit}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">P25 / P75</div>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>{stats.p25} / {stats.p75}</div>
                <div className="stat-unit">{stats.unit}</div>
              </div>
            </div>

            {stats.normal_range?.length === 2 && (
              <div className="alert alert-info">
                Zakres kliniczny: <strong>{stats.normal_range[0]}–{stats.normal_range[1]} {stats.unit}</strong>
                &nbsp;· Średnia populacji: <strong>{stats.mean} {stats.unit}</strong>
                {stats.mean > stats.normal_range[1] && ' ⚠ Średnia powyżej normy'}
                {stats.mean < stats.normal_range[0] && ' ⚠ Średnia poniżej normy'}
              </div>
            )}

            <div className="chart-container">
              <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.75rem', color: '#4a5568' }}>
                Rozkład wartości — {stats.label}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={histData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [v, 'Liczba pacjentów']} labelFormatter={(l) => `≥ ${l} ${stats.unit}`} />
                  <ReferenceLine x={stats.mean.toFixed(1)} stroke="#1565c0" strokeDasharray="4 2" label={{ value: 'Średnia', position: 'top', fontSize: 11 }} />
                  <Bar dataKey="count" fill="#1565c0" radius={[4, 4, 0, 0]}>
                    {histData.map((entry, i) => {
                      const inNorm = stats.normal_range?.length === 2
                        ? entry.x >= stats.normal_range[0] && entry.x <= stats.normal_range[1]
                        : true;
                      return <Cell key={i} fill={inNorm ? '#1565c0' : '#e53e3e'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: '.75rem', color: '#a0aec0', textAlign: 'center', marginTop: '.5rem' }}>
                🔵 W normie &nbsp; 🔴 Poza normą kliniczną
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}

// ── Compare / Full Profile Panel ──────────────────────────────────────────────
function ProfileAnalysis() {
  const [values, setValues] = useState(COMPARE_DEFAULTS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = (key, val) => setValues((v) => ({ ...v, [key]: parseFloat(val) || '' }));

  const run = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await analyzeAPI.fullProfile(values);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd analizy');
    } finally {
      setLoading(false);
    }
  };

  const radarData = result
    ? PROFILE_FIELDS.map(({ key, label }) => ({
        subject: label,
        z: result[key] ? Math.min(3, Math.max(-3, result[key].z_score)) : 0,
        fullMark: 3,
      }))
    : [];

  const severityCounts = result
    ? Object.values(result).reduce(
        (acc, r) => { acc[r.severity] = (acc[r.severity] || 0) + 1; return acc; },
        {}
      )
    : {};

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Analiza profilu pacjenta</span>
          <span className="badge badge-info">Porównanie z populacją</span>
        </div>

        <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
          🔐 Wartości zostaną zaszyfrowane CKKS przed wysłaniem do serwera obliczeniowego.
          Serwer zwraca wyniki zaszyfrowane — odszyfrowanie następuje po stronie lekarza.
        </div>

        <div className="form-grid">
          {PROFILE_FIELDS.map(({ key, label, unit }) => (
            <div className="form-group" key={key}>
              <label className="form-label">{label} <span style={{ color: '#a0aec0' }}>({unit})</span></label>
              <input
                className="form-input"
                type="number"
                step="any"
                value={values[key] ?? ''}
                onChange={(e) => handle(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={run} disabled={loading}>
          {loading ? '⏳ Analizowanie (HE)...' : '🔐 Uruchom analizę homomorficzną'}
        </button>

        {error && <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{error}</div>}
      </div>

      {result && (
        <>
          {/* Summary badges */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Podsumowanie wyników</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {severityCounts.normal && (
                <div className="stat-card green" style={{ flex: '1 1 150px' }}>
                  <div className="stat-label">W normie</div>
                  <div className="stat-value">{severityCounts.normal}</div>
                  <div className="stat-unit">parametry</div>
                </div>
              )}
              {severityCounts.warning && (
                <div className="stat-card orange" style={{ flex: '1 1 150px' }}>
                  <div className="stat-label">Nieznacznie poza normą</div>
                  <div className="stat-value">{severityCounts.warning}</div>
                  <div className="stat-unit">parametry</div>
                </div>
              )}
              {severityCounts.danger && (
                <div className="stat-card red" style={{ flex: '1 1 150px' }}>
                  <div className="stat-label">Znacznie poza normą</div>
                  <div className="stat-value">{severityCounts.danger}</div>
                  <div className="stat-unit">parametry</div>
                </div>
              )}
            </div>

            {/* Z-score bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {Object.entries(result).map(([key, r]) => {
                const pct = Math.min(100, Math.abs(r.z_score) / 3 * 100);
                const barClass = r.severity === 'normal' ? 'green' : r.severity === 'warning' ? 'orange' : 'red';
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: '.3rem' }}>
                      <span style={{ fontWeight: 600, color: '#2d3748' }}>{r.label}</span>
                      <span style={{ color: '#718096' }}>
                        {r.value} {r.unit} &nbsp;·&nbsp;
                        <span style={{ color: severityColor(r.severity), fontWeight: 600 }}>
                          z={r.z_score > 0 ? '+' : ''}{r.z_score}
                        </span>
                        &nbsp;·&nbsp; P{r.percentile}
                      </span>
                    </div>
                    <div className="z-bar-wrap">
                      <div className={`z-bar ${barClass}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: '.72rem', color: '#a0aec0', marginTop: '.2rem' }}>
                      Średnia populacji: {r.mean} ± {r.std} {r.unit}
                      &nbsp;·&nbsp;
                      {r.in_clinical_range ? '✅ W zakresie klinicznym' : '⚠️ Poza zakresem klinicznym'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Radar chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Wykres radarowy — Z-score parametrów</span>
            </div>
            <div style={{ fontSize: '.82rem', color: '#718096', marginBottom: '1rem' }}>
              Wartości z-score: 0 = średnia populacji, ±1 = 1 odchylenie, ±3 = skrajne odchylenie
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#4a5568' }} />
                <PolarRadiusAxis angle={30} domain={[-3, 3]} tick={{ fontSize: 9 }} />
                <Radar
                  name="Z-score pacjenta"
                  dataKey="z"
                  stroke="#1565c0"
                  fill="#1565c0"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <Legend />
                <Tooltip formatter={(v) => [`z = ${typeof v === 'number' ? v.toFixed(2) : v}`, '']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <span className="card-title">Szczegółowe wyniki</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Parametr</th>
                    <th>Wartość pacjenta</th>
                    <th>Średnia populacji</th>
                    <th>Odch. std.</th>
                    <th>Z-score</th>
                    <th>Percentyl</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result).map(([key, r]) => (
                    <tr key={key}>
                      <td><strong>{r.label}</strong></td>
                      <td>
                        <strong>{r.value}</strong>
                        <span style={{ color: '#a0aec0', fontSize: '.8rem' }}> {r.unit}</span>
                      </td>
                      <td>{r.mean} {r.unit}</td>
                      <td>±{r.std} {r.unit}</td>
                      <td style={{ color: severityColor(r.severity), fontWeight: 700 }}>
                        {r.z_score > 0 ? '+' : ''}{r.z_score}
                      </td>
                      <td>P{r.percentile}</td>
                      <td>
                        <span className={`badge badge-${r.severity}`}>
                          {r.severity === 'normal' ? '✓ OK' : r.severity === 'warning' ? '⚠ Uwaga' : '✗ Odchylenie'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Single Field Compare ──────────────────────────────────────────────────────
function SingleCompare() {
  const [field, setField] = useState('bmi');
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await analyzeAPI.compare(field, v);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Błąd');
    } finally {
      setLoading(false);
    }
  };

  const meta = FIELDS.find((f) => f.key === field);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Porównaj pojedynczą wartość</span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="form-group" style={{ flex: '1 1 220px', marginBottom: 0 }}>
          <label className="form-label">Parametr</label>
          <select className="form-select" value={field} onChange={(e) => { setField(e.target.value); setResult(null); }}>
            {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
          <label className="form-label">Wartość ({meta?.unit})</label>
          <input
            className="form-input"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`np. ${meta?.key === 'bmi' ? '26.0' : '...'}`}
          />
        </div>
        <button className="btn btn-primary" style={{ width: 'auto', marginBottom: '1.2rem' }} onClick={run} disabled={loading || !value}>
          {loading ? '⏳' : '🔐 Porównaj'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div className="stat-card">
            <div className="stat-label">Twoja wartość</div>
            <div className="stat-value">{result.value}</div>
            <div className="stat-unit">{result.unit}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Średnia populacji</div>
            <div className="stat-value">{result.mean}</div>
            <div className="stat-unit">{result.unit}</div>
          </div>
          <div className={`stat-card ${result.severity === 'normal' ? 'green' : result.severity === 'warning' ? 'orange' : 'red'}`}>
            <div className="stat-label">Z-score</div>
            <div className="stat-value">{result.z_score > 0 ? '+' : ''}{result.z_score}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Percentyl</div>
            <div className="stat-value">P{result.percentile}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className={`alert alert-${result.severity === 'normal' ? 'success' : result.severity === 'warning' ? 'warning' : 'danger'}`}>
              <strong>{result.interpretation}</strong>
              &nbsp;·&nbsp; Odchylenie od średniej: {result.diff > 0 ? '+' : ''}{result.diff} {result.unit}
              {result.normal_range?.length === 2 && (
                <span> · Zakres kliniczny: {result.normal_range[0]}–{result.normal_range[1]} {result.unit}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Analytics ────────────────────────────────────────────────────────────
export default function Analytics() {
  const [tab, setTab] = useState('population');

  return (
    <div>
      <div className="he-info-bar">
        🔐 Wszystkie obliczenia statystyczne wykonywane są na zaszyfrowanych danych (schemat CKKS). Serwer obliczeniowy nie ma dostępu do klucza tajnego.
      </div>

      <div className="section-title">Analizy statystyczne</div>
      <div className="section-sub">
        Szyfrowanie homomorficzne CKKS — obliczenia na zaszyfrowanych danych medycznych.
      </div>

      <div className="inner-tabs">
        <button className={`inner-tab ${tab === 'population' ? 'active' : ''}`} onClick={() => setTab('population')}>
          📊 Statystyki populacji
        </button>
        <button className={`inner-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
          🧬 Analiza profilu pacjenta
        </button>
        <button className={`inner-tab ${tab === 'single' ? 'active' : ''}`} onClick={() => setTab('single')}>
          🔍 Porównanie wartości
        </button>
      </div>

      {tab === 'population' && <PopulationStats />}
      {tab === 'profile'    && <ProfileAnalysis />}
      {tab === 'single'     && <SingleCompare />}
    </div>
  );
}
