import React, { useState, useRef } from 'react';
import type { DermatologyAnalysisResponse } from './dermatology';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import {
  Activity,
  Upload,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Printer,
  CheckCircle2,
  ScanLine,
  BookOpen,
  Info
} from 'lucide-react';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function App() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [box1, setBox1] = useState<Box | null>(null);
  const [box2, setBox2] = useState<Box | null>(null);
  const [noLesion2, setNoLesion2] = useState<boolean>(false);

  // Datos de contexto clínico de la consulta
  const [patientCode, setPatientCode] = useState<string>('FICHA-2026-0419');
  const [anatomicalSite, setAnatomicalSite] = useState<string>('Dorso superior / Escápula');
  const [controlInterval, setControlInterval] = useState<string>('6 meses (Estándar)');

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<DermatologyAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef1 = useRef<HTMLInputElement | null>(null);
  const inputRef2 = useRef<HTMLInputElement | null>(null);

  const [dragStart1, setDragStart1] = useState<{ x: number; y: number } | null>(null);
  const [dragStart2, setDragStart2] = useState<{ x: number; y: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, num: 1 | 2) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (num === 1) {
      setFile1(file);
      setPreview1(url);
      setBox1(null);
    } else {
      setFile2(file);
      setPreview2(url);
      setBox2(null);
      setNoLesion2(false);
    }
  };

  const handleReset = () => {
    setFile1(null);
    setFile2(null);
    setPreview1(null);
    setPreview2(null);
    setBox1(null);
    setBox2(null);
    setNoLesion2(false);
    setResult(null);
    setError(null);
    if (inputRef1.current) inputRef1.current.value = '';
    if (inputRef2.current) inputRef2.current.value = '';
  };

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, num: 1 | 2) => {
    const pos = getRelativeCoords(e);
    if (num === 1) {
      setDragStart1(pos);
      setBox1({ x: pos.x, y: pos.y, w: 0, h: 0 });
    } else {
      if (noLesion2) return;
      setDragStart2(pos);
      setBox2({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, num: 1 | 2) => {
    const start = num === 1 ? dragStart1 : dragStart2;
    if (!start) return;
    const current = getRelativeCoords(e);

    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);

    if (num === 1) setBox1({ x, y, w, h });
    else setBox2({ x, y, w, h });
  };

  const handleMouseUp = (num: 1 | 2) => {
    if (num === 1) setDragStart1(null);
    else setDragStart2(null);
  };

  const handleAnalyze = async () => {
    if (!file1 || !file2) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file_control_1', file1);
    formData.append('file_control_2', file2);

    const effectiveBox1 = box1 && box1.w > 0.01 ? box1 : { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    formData.append('roi_1', JSON.stringify(effectiveBox1));

    if (noLesion2) {
      formData.append('roi_2', JSON.stringify({ x: 0, y: 0, w: 0, h: 0 }));
    } else {
      const effectiveBox2 = box2 && box2.w > 0.01 ? box2 : { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
      formData.append('roi_2', JSON.stringify(effectiveBox2));
    }

    try {
      const response = await fetch('http://localhost:8000/api/dermatology-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || `Error del servidor (${response.status})`);
      }

      const data: DermatologyAnalysisResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'No fue posible comunicarse con el servicio de análisis clínico.');
    } finally {
      setLoading(false);
    }
  };

  const getClinicalTriage = (deltaArea: number, deltaCirc: number) => {
    if (deltaArea <= -30) {
      return {
        priority: 'Prioridad Alta — Derivación Preferente (<= 48–72 h)',
        summary: 'Reducción significativa de superficie compatible con fenómeno de regresión.',
        action: 'Biopsia escisional / Evaluación oncológica prioritaria',
        bg: '#fef2f2',
        border: '#fecaca',
        accent: '#dc2626',
        text: '#991b1b'
      };
    }
    if (deltaArea >= 20) {
      return {
        priority: 'Prioridad Alta — Evaluación Especializada',
        summary: 'Crecimiento dimensional superior al umbral clínico de estabilidad (+20%).',
        action: 'Dermatoscopia presencial y eventual exéresis diagnóstica',
        bg: '#fff7ed',
        border: '#fed7aa',
        accent: '#ea580c',
        text: '#9a3412'
      };
    }
    if (deltaCirc <= -0.08) {
      return {
        priority: 'Prioridad Moderada — Control Adelantado (<= 30 días)',
        summary: 'Incremento de irregularidad perimetral y pérdida de simetría.',
        action: 'Control dermatoscópico digital a corto plazo',
        bg: '#fefce8',
        border: '#fef08a',
        accent: '#ca8a04',
        text: '#854d0e'
      };
    }
    return {
      priority: 'Riesgo Bajo — Conducta de Seguimiento Habitual',
      summary: 'Parámetros dimensionales y morfológicos dentro de rangos de estabilidad.',
      action: 'Control periódico anual y fotoprotección',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      accent: '#16a34a',
      text: '#166534'
    };
  };

  const triage = result
    ? getClinicalTriage(result.metrics.delta_area_percent, result.metrics.delta_circularity)
    : null;

  return (
    <div className="app-shell">
      {/* TOP CLINICAL NAVBAR */}
      <header className="clinical-navbar">
        <div className="navbar-inner">
          <div className="brand-group">
            <div className="brand-logo">
              <ScanLine size={20} />
            </div>
            <div>
              <h1 className="brand-title">DermaGuard</h1>
              <p className="brand-subtitle">Plataforma de Seguimiento Dermatoscópico Digital</p>
            </div>
          </div>

          <div className="navbar-actions">
            <span className="privacy-pill">
              <ShieldCheck size={14} />
              Procesamiento de Imagen Anonimizado en Local
            </span>

            {(file1 || file2 || result) && (
              <button onClick={handleReset} className="btn btn-secondary no-print">
                <RotateCcw size={15} />
                Nueva Evaluación
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="main-container">
        {/* PATIENT / CONSULTATION CONTEXT BAR */}
        <section className="context-bar">
          <div className="context-items">
            <div className="context-item">
              <label className="context-label" htmlFor="patient-code">ID Ficha / Estudio</label>
              <input
                id="patient-code"
                className="context-input"
                type="text"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value)}
              />
            </div>

            <div className="context-item">
              <label className="context-label" htmlFor="anatomical-site">Localización Anatómica</label>
              <select
                id="anatomical-site"
                className="context-input"
                value={anatomicalSite}
                onChange={(e) => setAnatomicalSite(e.target.value)}
              >
                <option value="Dorso superior / Escápula">Dorso superior / Escápula</option>
                <option value="Tórax anterior">Tórax anterior</option>
                <option value="Cabeza y cuello">Cabeza y cuello</option>
                <option value="Extremidad superior">Extremidad superior</option>
                <option value="Extremidad inferior">Extremidad inferior</option>
                <option value="Región acral (palmar/plantar)">Región acral (palmar/plantar)</option>
              </select>
            </div>

            <div className="context-item">
              <label className="context-label" htmlFor="control-interval">Intervalo entre Controles</label>
              <select
                id="control-interval"
                className="context-input"
                value={controlInterval}
                onChange={(e) => setControlInterval(e.target.value)}
              >
                <option value="3 meses (Corto plazo)">3 meses (Corto plazo)</option>
                <option value="6 meses (Estándar)">6 meses (Estándar)</option>
                <option value="12 meses (Anual)">12 meses (Anual)</option>
              </select>
            </div>
          </div>

          <div className="context-item" style={{ textAlign: 'right' }}>
            <span className="context-label">Fecha de Emisión</span>
            <span className="context-value">{new Date().toLocaleDateString('es-CL')}</span>
          </div>
        </section>

        {/* DUAL IMAGE CAPTURE WORKSPACE */}
        <section className="capture-grid no-print">
          {/* CONTROL 1 (BASAL) */}
          <div className="capture-card">
            <div className="capture-header">
              <div className="capture-title-group">
                <span className={`step-badge ${preview1 ? 'active' : ''}`}>Control 1</span>
                <h2 className="capture-title">Registro Basal (Primera Consulta)</h2>
              </div>

              {preview1 && (
                <div className="capture-controls">
                  {box1 && (
                    <button type="button" onClick={() => setBox1(null)} className="btn-ghost">
                      Restablecer área
                    </button>
                  )}
                  <label htmlFor="c1" className="btn-ghost">
                    Cambiar imagen
                  </label>
                </div>
              )}
            </div>

            <input
              ref={inputRef1}
              type="file"
              accept="image/*"
              id="c1"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 1)}
            />

            <div className="capture-body">
              {!preview1 ? (
                <label htmlFor="c1" className="upload-dropzone">
                  <div className="upload-icon-circle">
                    <Upload size={20} />
                  </div>
                  <div className="upload-primary-text">Seleccionar fotografía basal</div>
                  <div className="upload-secondary-text">
                    Formatos admitidos: JPG, PNG, TIFF • Imagen dermatoscópica o clínica macro
                  </div>
                </label>
              ) : (
                <div
                  className="image-stage"
                  onMouseDown={(e) => handleMouseDown(e, 1)}
                  onMouseMove={(e) => handleMouseMove(e, 1)}
                  onMouseUp={() => handleMouseUp(1)}
                >
                  <img src={preview1} alt="Registro Basal" />
                  {box1 && box1.w > 0 && (
                    <div
                      className="roi-overlay"
                      style={{
                        left: `${box1.x * 100}%`,
                        top: `${box1.y * 100}%`,
                        width: `${box1.w * 100}%`,
                        height: `${box1.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="capture-footer">
              <span>{file1 ? file1.name : 'Ningún archivo seleccionado'}</span>
              <span>
                {box1 && box1.w > 0.01
                  ? 'Área de interés delimitada manualmente'
                  : 'Arrastre sobre la imagen para delimitar la lesión'}
              </span>
            </div>
          </div>

          {/* CONTROL 2 (SEGUIMIENTO) */}
          <div className="capture-card">
            <div className="capture-header">
              <div className="capture-title-group">
                <span className={`step-badge ${preview2 ? 'active' : ''}`}>Control 2</span>
                <h2 className="capture-title">Registro de Seguimiento (Control Actual)</h2>
              </div>

              {preview2 && (
                <div className="capture-controls">
                  {!noLesion2 && box2 && (
                    <button type="button" onClick={() => setBox2(null)} className="btn-ghost">
                      Restablecer área
                    </button>
                  )}
                  <label htmlFor="c2" className="btn-ghost">
                    Cambiar imagen
                  </label>
                </div>
              )}
            </div>

            <input
              ref={inputRef2}
              type="file"
              accept="image/*"
              id="c2"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 2)}
            />

            <div className="capture-body">
              {!preview2 ? (
                <label htmlFor="c2" className="upload-dropzone">
                  <div className="upload-icon-circle">
                    <Upload size={20} />
                  </div>
                  <div className="upload-primary-text">Seleccionar fotografía de seguimiento</div>
                  <div className="upload-secondary-text">
                    Utilice condiciones de iluminación y distancia equivalentes al control basal
                  </div>
                </label>
              ) : noLesion2 ? (
                <div className="remission-placeholder">
                  <AlertTriangle size={26} color="#d97706" style={{ marginBottom: '0.5rem' }} />
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                    Ausencia de Lesión Visible en Control Actual
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '380px' }}>
                    Se registrará reducción total del área pigmentada para evaluar criterios clínicos de regresión o exéresis previa.
                  </div>
                </div>
              ) : (
                <div
                  className="image-stage"
                  onMouseDown={(e) => handleMouseDown(e, 2)}
                  onMouseMove={(e) => handleMouseMove(e, 2)}
                  onMouseUp={() => handleMouseUp(2)}
                >
                  <img src={preview2} alt="Registro de Seguimiento" />
                  {box2 && box2.w > 0 && (
                    <div
                      className="roi-overlay"
                      style={{
                        left: `${box2.x * 100}%`,
                        top: `${box2.y * 100}%`,
                        width: `${box2.w * 100}%`,
                        height: `${box2.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="capture-footer">
              <span>{file2 ? file2.name : 'Ningún archivo seleccionado'}</span>
              {preview2 ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#334155', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={noLesion2}
                    onChange={(e) => {
                      setNoLesion2(e.target.checked);
                      if (e.target.checked) setBox2(null);
                    }}
                  />
                  Lesión ausente en control actual
                </label>
              ) : (
                <span>Arrastre sobre la imagen para delimitar la lesión</span>
              )}
            </div>
          </div>
        </section>

        {/* ACTION BAR */}
        <section className="action-bar no-print">
          <div className="action-hint">
            <Info size={16} color="#0f766e" style={{ flexShrink: 0 }} />
            <span>
              Al iniciar el análisis, el sistema segmenta el borde de la lesión en ambos controles, calcula la variación morfométrica y genera el informe clínico de apoyo.
            </span>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!file1 || !file2 || loading}
            className="btn btn-primary"
          >
            <Activity size={16} />
            {loading ? 'Analizando evolución y generando informe...' : 'Generar Evaluación Comparativa'}
          </button>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <div
            style={{
              padding: '1rem 1.25rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem'
            }}
          >
            <AlertTriangle size={18} />
            <div>
              <strong>No se pudo completar el análisis:</strong> {error}
            </div>
          </div>
        )}

        {/* CLINICAL RESULTS */}
        {result && triage && (
          <div className="results-stack">
            {/* TRIAGE SUMMARY BANNER */}
            <div
              className="triage-banner"
              style={{
                backgroundColor: triage.bg,
                borderColor: triage.border,
                borderLeft: `4px solid ${triage.accent}`,
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: triage.accent, marginBottom: '0.2rem' }}>
                  Orientación de Prioridad Clínica
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: triage.text }}>
                  {triage.priority}
                </div>
                <div style={{ fontSize: '0.875rem', color: triage.text, marginTop: '0.15rem' }}>
                  {triage.summary}
                </div>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-secondary no-print"
              >
                <Printer size={15} />
                Imprimir / Guardar PDF
              </button>
            </div>

            {/* 3 KPI SUMMARY CARDS */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Variación de Superficie (Δ Área)</div>
                <div
                  className="kpi-value"
                  style={{
                    color:
                      result.metrics.delta_area_percent >= 20 || result.metrics.delta_area_percent <= -30
                        ? '#dc2626'
                        : '#0f766e'
                  }}
                >
                  {result.metrics.delta_area_percent > 0
                    ? `+${result.metrics.delta_area_percent}%`
                    : `${result.metrics.delta_area_percent}%`}
                </div>
                <div className="kpi-sub">
                  Control 1: {result.metrics.control_1_area} px² → Control 2: {result.metrics.control_2_area} px²
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Variación de Simetría (Circularidad)</div>
                <div className="kpi-value">
                  {result.metrics.delta_circularity > 0
                    ? `+${result.metrics.delta_circularity}`
                    : result.metrics.delta_circularity}
                </div>
                <div className="kpi-sub">
                  Índice Basal: {result.metrics.control_1_circularity} → Actual: {result.metrics.control_2_circularity}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">Conducta Sugerida</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginTop: '0.2rem' }}>
                  {triage.action}
                </div>
                <div className="kpi-sub">
                  Localización: {anatomicalSite} ({controlInterval})
                </div>
              </div>
            </div>

            {/* SEGMENTED MASKS & QUANTITATIVE TABLE */}
            <div className="analysis-grid">
              {/* Segmented Contours */}
              <div className="section-card">
                <div className="section-header">
                  <h3 className="section-title">
                    <ScanLine size={16} color="#0f766e" />
                    Delimitación Automática de Contornos
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Comparativa T0 vs. T1
                  </span>
                </div>

                <div className="masks-pair">
                  <div className="mask-box">
                    <div className="mask-box-header">
                      <span>Control 1 (Basal)</span>
                      <span>{result.metrics.control_1_area} px²</span>
                    </div>
                    <img src={result.control_1_image} alt="Segmentación Control 1" />
                  </div>

                  <div className="mask-box">
                    <div className="mask-box-header">
                      <span>Control 2 (Actual)</span>
                      <span>{result.metrics.control_2_area} px²</span>
                    </div>
                    <img src={result.control_2_image} alt="Segmentación Control 2" />
                  </div>
                </div>
              </div>

              {/* Morphometric Table & Clinical Guidelines */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="section-card">
                  <div className="section-header">
                    <h3 className="section-title">Resumen Cuantitativo de Mediciones</h3>
                  </div>

                  <table className="clinical-table">
                    <thead>
                      <tr>
                        <th>Parámetro</th>
                        <th>Basal</th>
                        <th>Actual</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Superficie (px²)</td>
                        <td>{result.metrics.control_1_area}</td>
                        <td>{result.metrics.control_2_area}</td>
                        <td style={{ fontWeight: 600 }}>
                          {result.metrics.delta_area_percent > 0
                            ? `+${result.metrics.delta_area_percent}%`
                            : `${result.metrics.delta_area_percent}%`}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Circularidad (0–1)</td>
                        <td>{result.metrics.control_1_circularity}</td>
                        <td>{result.metrics.control_2_circularity}</td>
                        <td style={{ fontWeight: 600 }}>
                          {result.metrics.delta_circularity > 0
                            ? `+${result.metrics.delta_circularity}`
                            : result.metrics.delta_circularity}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="section-card" style={{ flex: 1 }}>
                  <div className="section-header">
                    <h3 className="section-title">
                      <BookOpen size={15} color="#0f766e" />
                      Criterios de Guías Clínicas Aplicados
                    </h3>
                  </div>
                  <div
                    style={{
                      padding: '1rem 1.25rem',
                      fontSize: '0.825rem',
                      color: '#475569',
                      lineHeight: 1.6,
                      maxHeight: '150px',
                      overflowY: 'auto'
                    }}
                  >
                    {result.retrieved_guidelines}
                  </div>
                </div>
              </div>
            </div>

            {/* CLINICAL REPORT CARD */}
            <div className="section-card">
              <div className="section-header">
                <h3 className="section-title">
                  <FileText size={16} color="#0f766e" />
                  Informe de Evolución Dermatoscópica
                </h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
                  <CheckCircle2 size={14} />
                  Ficha: {patientCode}
                </span>
              </div>

              <div className="report-body">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.clinical_report}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="report-footer">
                <span>
                  Documento de apoyo al diagnóstico médico. La indicación terapéutica o quirúrgica definitiva corresponde al médico especialista tratante.
                </span>
                <span>DermaGuard Clinical Suite • Ley 20.584</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
