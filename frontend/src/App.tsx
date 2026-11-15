import React, { useState, useRef } from 'react';
import type { DermatologyAnalysisResponse } from './dermatology';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  Crosshair,
  Upload,
  RotateCcw,
  ShieldCheck,
  Database,
  AlertTriangle,
  FileText,
  Layers,
  Cpu,
  CheckCircle2,
  SlidersHorizontal
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
  const [studyId] = useState<string>(() => `DG-2026-${Math.floor(1000 + Math.random() * 9000)}`);

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
        throw new Error(err?.detail || `HTTP ${response.status}`);
      }

      const data: DermatologyAnalysisResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Fallo de comunicación con el nodo Edge (:8000).');
    } finally {
      setLoading(false);
    }
  };

  const formatRoiReadout = (b: Box | null, absent = false) => {
    if (absent) return 'ROI: REMISION / EXERESIS (0.00, 0.00)';
    if (!b || b.w < 0.01) return 'ROI: AUTO-CENTER [0.20, 0.20, 0.60×0.60]';
    return `ROI: [${b.x.toFixed(2)}, ${b.y.toFixed(2)}] DIM: ${(b.w * 100).toFixed(1)}%×${(b.h * 100).toFixed(1)}%`;
  };

  const getClinicalStatus = (deltaArea: number, deltaCirc: number) => {
    if (deltaArea <= -30) {
      return {
        level: 'PRIORIDAD ROJA (NIVEL 1 - URGENCIA <= 48-72H)',
        reason: 'SOSPECHA DE REGRESIÓN TUMORAL INMUNOLÓGICA (Δ ÁREA <= -30%)',
        bg: '#fef2f2',
        border: '#dc2626',
        color: '#991b1b',
        badgeBg: '#dc2626'
      };
    }
    if (deltaArea >= 20) {
      return {
        level: 'PRIORIDAD ROJA / NARANJA (DERIVACIÓN PRIORITARIA)',
        reason: 'EXPANSIÓN LESIONAL SOBRE UMBRAL ABCDE (Δ ÁREA >= +20%)',
        bg: '#fff7ed',
        border: '#ea580c',
        color: '#9a3412',
        badgeBg: '#ea580c'
      };
    }
    if (deltaCirc <= -0.08) {
      return {
        level: 'PRIORIDAD AMARILLA (CONTROL DERMATOSCÓPICO <= 30 DÍAS)',
        reason: 'PÉRDIDA DE SIMETRÍA Y TENSIÓN PERIMETRAL (Δ CIRCULARIDAD <= -0.08)',
        bg: '#fefce8',
        border: '#ca8a04',
        color: '#854d0e',
        badgeBg: '#ca8a04'
      };
    }
    return {
      level: 'PRIORIDAD VERDE (SEGUIMIENTO ANUAL ESTÁNDAR)',
      reason: 'ESTABILIDAD MORFOMÉTRICA DENTRO DE PARÁMETROS BENIGNOS',
      bg: '#f0fdf4',
      border: '#0d9488',
      color: '#115e59',
      badgeBg: '#0d9488'
    };
  };

  const statusInfo = result
    ? getClinicalStatus(result.metrics.delta_area_percent, result.metrics.delta_circularity)
    : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f3f5f8' }}>
      {/* TOP HOSPITAL WORKSTATION BAR */}
      <header
        style={{
          backgroundColor: '#0b111e',
          color: '#f8fafc',
          borderBottom: '1px solid #1e293b',
          padding: '0 24px',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                backgroundColor: '#0284c7',
                border: '1px solid #38bdf8'
              }}
            />
            <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.04em', color: '#ffffff' }}>
              DERMAGUARD
            </span>
            <span
              className="mono"
              style={{
                fontSize: '11px',
                color: '#38bdf8',
                backgroundColor: 'rgba(2, 132, 199, 0.18)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                padding: '2px 6px'
              }}
            >
              PACS WORKSTATION v2.4
            </span>
          </div>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#94a3b8' }}>
            UNIDAD DE DERMATOLOGÍA ONCOLÓGICA &amp; TELEMEDICINA
          </span>
        </div>

        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
            <Cpu size={13} color="#10b981" />
            <span>EDGE NODE: CIE-LAB ΔE LOCAL</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
            <Layers size={13} color="#38bdf8" />
            <span>ORCHESTRATOR: ADK 3-LEVEL</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1' }}>
            <Database size={13} color="#f59e0b" />
            <span>RAG: AZURE AI FOUNDRY (2 KBs)</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              padding: '3px 8px'
            }}
          >
            <ShieldCheck size={13} />
            <span>ZERO-TRUST NSG</span>
          </div>
        </div>
      </header>

      {/* CLINICAL SESSION METADATA & TOOLBAR */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #dce2ec',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '12px' }}>
          <div>
            <span style={{ color: '#64748b', fontWeight: 500, marginRight: '6px' }}>ID ESTUDIO:</span>
            <span className="mono" style={{ fontWeight: 600, color: '#0f172a' }}>{studyId}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 500, marginRight: '6px' }}>PROTOCOLO:</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Seguimiento Bi-Temporal (0 – 6 Meses)</span>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 500, marginRight: '6px' }}>ALGORITMO EDGE:</span>
            <span className="mono" style={{ color: '#334155' }}>CIE L*a*b* ΔE + Umbralización Otsu + Cierre Elíptico 5×5</span>
          </div>
          <div>
            <span style={{ color: '#64748b', fontWeight: 500, marginRight: '6px' }}>SOBERANÍA:</span>
            <span style={{ color: '#0d9488', fontWeight: 600 }}>Sin Exfiltración de Píxeles Biométricos</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleReset}
            disabled={!file1 && !file2 && !result}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: '#ffffff',
              color: (!file1 && !file2 && !result) ? '#94a3b8' : '#334155',
              border: '1px solid #cbd5e1',
              cursor: (!file1 && !file2 && !result) ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.03em'
            }}
          >
            <RotateCcw size={13} />
            Reiniciar Estudio
          </button>

          <button
            onClick={handleAnalyze}
            disabled={!file1 || !file2 || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 18px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: (!file1 || !file2 || loading) ? '#94a3b8' : '#0284c7',
              color: '#ffffff',
              border: '1px solid',
              borderColor: (!file1 || !file2 || loading) ? '#94a3b8' : '#0369a1',
              cursor: (!file1 || !file2 || loading) ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}
          >
            <Activity size={14} />
            {loading ? 'Procesando Telemetría y Consultando KBs...' : 'Ejecutar Evaluación Bi-Temporal'}
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE CONTAINER */}
      <main style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '20px 24px', flex: 1 }}>
        {/* OPERATOR PROTOCOL NOTICE */}
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #dce2ec',
            borderLeft: '3px solid #0284c7',
            padding: '10px 16px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
            color: '#334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Crosshair size={15} color="#0284c7" />
            <span>
              <strong>PROCEDIMIENTO DE DELIMITACIÓN ROI:</strong> Cargue los controles dermatoscópicos T0 y T1. Trace con el cursor el recuadro de la Región de Interés (ROI) conteniendo la lesión y un margen perimetral de piel sana para calibrar la línea base colorimétrica.
            </span>
          </div>
          <span className="mono" style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', marginLeft: '16px' }}>
            ESCISIONAL REF: ABCDE &gt;20% | REGRESIÓN &le;-30%
          </span>
        </div>

        {/* DUAL PACS VIEWPORTS (CONTROL 1 & CONTROL 2) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
          {/* VIEWPORT T0 */}
          <section
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dce2ec',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Panel Header */}
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #dce2ec',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="mono"
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 6px'
                  }}
                >
                  T0 • BASAL
                </span>
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                  Registro Fotográfico Inicial (Mes 0)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {preview1 && (
                  <>
                    <button
                      onClick={() => setBox1(null)}
                      style={{
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Restablecer ROI
                    </button>
                    <label
                      htmlFor="c1"
                      style={{
                        border: '1px solid #cbd5e1',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: '#0284c7',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cambiar Archivo
                    </label>
                  </>
                )}
              </div>
            </div>

            <input
              ref={inputRef1}
              type="file"
              accept="image/*"
              id="c1"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 1)}
            />

            {/* Viewport Area */}
            <div
              className="pacs-viewport"
              style={{
                height: '320px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {!preview1 ? (
                <label
                  htmlFor="c1"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '28px 40px',
                    border: '1px dashed #475569',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    color: '#cbd5e1',
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={22} color="#38bdf8" />
                  <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>
                    CARGAR IMAGEN DERMATOSCÓPICA BASAL (T0)
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                    FORMATOS SOPORTADOS: PNG, JPG, BMP, TIFF
                  </span>
                </label>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    cursor: 'crosshair',
                    userSelect: 'none',
                    maxHeight: '300px',
                    maxWidth: '95%'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, 1)}
                  onMouseMove={(e) => handleMouseMove(e, 1)}
                  onMouseUp={() => handleMouseUp(1)}
                >
                  <img
                    src={preview1}
                    alt="Control T0"
                    style={{
                      maxHeight: '300px',
                      maxWidth: '100%',
                      display: 'block',
                      pointerEvents: 'none',
                      border: '1px solid #334155'
                    }}
                  />
                  {box1 && box1.w > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        border: '1.5px solid #38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.14)',
                        boxShadow: '0 0 0 1px rgba(11, 17, 30, 0.6)',
                        left: `${box1.x * 100}%`,
                        top: `${box1.y * 100}%`,
                        width: `${box1.w * 100}%`,
                        height: `${box1.h * 100}%`,
                        pointerEvents: 'none'
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          position: 'absolute',
                          top: '-18px',
                          left: 0,
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          fontSize: '9.5px',
                          padding: '1px 4px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        ROI-T0
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Viewport Telemetry Footer */}
            <div
              className="mono"
              style={{
                padding: '7px 14px',
                backgroundColor: '#0f172a',
                color: '#94a3b8',
                borderTop: '1px solid #1e293b',
                fontSize: '11px',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>ARCHIVO: {file1 ? file1.name : 'SIN_ASIGNAR'}</span>
              <span style={{ color: '#38bdf8' }}>{formatRoiReadout(box1)}</span>
            </div>
          </section>

          {/* VIEWPORT T1 */}
          <section
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dce2ec',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Panel Header */}
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #dce2ec',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="mono"
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 6px'
                  }}
                >
                  T1 • +6 MESES
                </span>
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                  Control Evolutivo Posterior (Mes 6)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {preview2 && (
                  <>
                    <label
                      style={{
                        fontSize: '11.5px',
                        color: '#334155',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontWeight: 500
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={noLesion2}
                        onChange={(e) => {
                          setNoLesion2(e.target.checked);
                          if (e.target.checked) setBox2(null);
                        }}
                      />
                      Ausencia / Regresión Total
                    </label>
                    {!noLesion2 && (
                      <button
                        onClick={() => setBox2(null)}
                        style={{
                          background: 'none',
                          border: '1px solid #cbd5e1',
                          padding: '3px 8px',
                          fontSize: '11px',
                          color: '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        Restablecer ROI
                      </button>
                    )}
                    <label
                      htmlFor="c2"
                      style={{
                        border: '1px solid #cbd5e1',
                        padding: '3px 8px',
                        fontSize: '11px',
                        color: '#0284c7',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cambiar Archivo
                    </label>
                  </>
                )}
              </div>
            </div>

            <input
              ref={inputRef2}
              type="file"
              accept="image/*"
              id="c2"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, 2)}
            />

            {/* Viewport Area */}
            <div
              className="pacs-viewport"
              style={{
                height: '320px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {!preview2 ? (
                <label
                  htmlFor="c2"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '28px 40px',
                    border: '1px dashed #475569',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    color: '#cbd5e1',
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={22} color="#38bdf8" />
                  <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>
                    CARGAR IMAGEN DE CONTROL EVOLUTIVO (T1)
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                    INTERVALO ESTÁNDAR: +180 DÍAS (6 MESES)
                  </span>
                </label>
              ) : noLesion2 ? (
                <div
                  style={{
                    padding: '24px 32px',
                    border: '1px solid #dc2626',
                    backgroundColor: 'rgba(127, 29, 29, 0.35)',
                    color: '#fecaca',
                    textAlign: 'center',
                    maxWidth: '420px'
                  }}
                >
                  <AlertTriangle size={24} color="#f87171" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', letterSpacing: '0.03em' }}>
                    LESIÓN AUSENTE EN CONTROL T1 (ÁREA = 0 px²)
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#fca5a5', lineHeight: 1.4 }}>
                    Se evaluará protocolo de regresión tumoral inmunológica (Δ = -100%) conforme a KB 2 de Triage Oncológico.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    cursor: 'crosshair',
                    userSelect: 'none',
                    maxHeight: '300px',
                    maxWidth: '95%'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, 2)}
                  onMouseMove={(e) => handleMouseMove(e, 2)}
                  onMouseUp={() => handleMouseUp(2)}
                >
                  <img
                    src={preview2}
                    alt="Control T1"
                    style={{
                      maxHeight: '300px',
                      maxWidth: '100%',
                      display: 'block',
                      pointerEvents: 'none',
                      border: '1px solid #334155'
                    }}
                  />
                  {box2 && box2.w > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        border: '1.5px solid #38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.14)',
                        boxShadow: '0 0 0 1px rgba(11, 17, 30, 0.6)',
                        left: `${box2.x * 100}%`,
                        top: `${box2.y * 100}%`,
                        width: `${box2.w * 100}%`,
                        height: `${box2.h * 100}%`,
                        pointerEvents: 'none'
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          position: 'absolute',
                          top: '-18px',
                          left: 0,
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          fontSize: '9.5px',
                          padding: '1px 4px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        ROI-T1
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Viewport Telemetry Footer */}
            <div
              className="mono"
              style={{
                padding: '7px 14px',
                backgroundColor: '#0f172a',
                color: '#94a3b8',
                borderTop: '1px solid #1e293b',
                fontSize: '11px',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>ARCHIVO: {file2 ? file2.name : 'SIN_ASIGNAR'}</span>
              <span style={{ color: '#38bdf8' }}>{formatRoiReadout(box2, noLesion2)}</span>
            </div>
          </section>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #dc2626',
              borderLeft: '4px solid #dc2626',
              color: '#991b1b',
              marginBottom: '20px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <AlertTriangle size={16} color="#dc2626" />
            <div>
              <strong>EXCEPCIÓN DE SISTEMA:</strong> {error}
            </div>
          </div>
        )}

        {/* RESULTS WORKSPACE */}
        {result && statusInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* AUTOMATED TRIAGE CLASSIFICATION BANNER */}
            <div
              style={{
                backgroundColor: statusInfo.bg,
                border: `1px solid ${statusInfo.border}`,
                borderLeft: `5px solid ${statusInfo.border}`,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  className="mono"
                  style={{
                    backgroundColor: statusInfo.badgeBg,
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    letterSpacing: '0.04em'
                  }}
                >
                  DICTAMEN AUTOMÁTICO DE TRIAGE
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: statusInfo.color }}>
                    {statusInfo.level}
                  </div>
                  <div className="mono" style={{ fontSize: '11.5px', color: statusInfo.color, marginTop: '2px' }}>
                    CRITERIO ACTIVADO: {statusInfo.reason}
                  </div>
                </div>
              </div>

              <div className="mono" style={{ fontSize: '11px', color: '#475569', textAlign: 'right' }}>
                <div>MODELO FRONTERA: AZURE OPENAI GPT-4o (T=0.25)</div>
                <div>ÍNDICES CONSULTADOS: KB-1 (CONSENSO/MINSAL) + KB-2 (TRIAGE GES)</div>
              </div>
            </div>

            {/* QUANTITATIVE MORPHOMETRIC TELEMETRY + SEGMENTED MASKS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '18px' }}>
              {/* Left: Segmented Binary Contours */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #dce2ec',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #dce2ec',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SlidersHorizontal size={14} color="#0284c7" />
                    <span style={{ fontWeight: 600, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Contornos de Segmentación Perimetral CIE L*a*b* ΔE
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                    KERNEL ELÍPTICO 5×5 • OTSU
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '14px' }}>
                  <div style={{ border: '1px solid #dce2ec', backgroundColor: '#0b111e' }}>
                    <div
                      className="mono"
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        color: '#cbd5e1',
                        borderBottom: '1px solid #1e293b',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>MÁSCARA T0 (BASAL)</span>
                      <span style={{ color: '#38bdf8' }}>{result.metrics.control_1_area} px²</span>
                    </div>
                    <img
                      src={result.control_1_image}
                      alt="Segmentación T0"
                      style={{ width: '100%', height: '210px', objectFit: 'contain', display: 'block' }}
                    />
                  </div>

                  <div style={{ border: '1px solid #dce2ec', backgroundColor: '#0b111e' }}>
                    <div
                      className="mono"
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        color: '#cbd5e1',
                        borderBottom: '1px solid #1e293b',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>MÁSCARA T1 (+6 MESES)</span>
                      <span style={{ color: '#38bdf8' }}>{result.metrics.control_2_area} px²</span>
                    </div>
                    <img
                      src={result.control_2_image}
                      alt="Segmentación T1"
                      style={{ width: '100%', height: '210px', objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                </div>
              </div>

              {/* Right: Tabular Morphometric Readout & RAG Evidence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #dce2ec' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #dce2ec',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Matriz Morfométrica Diferencial (Nodo Edge)
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: '#0d9488' }}>
                      PAYLOAD ANONIMIZADO
                    </span>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #dce2ec', color: '#475569', fontSize: '11px' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>PARÁMETRO</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>BASAL (T0)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>CONTROL (T1)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>DELTA (Δ)</th>
                      </tr>
                    </thead>
                    <tbody className="mono">
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#0f172a' }}>
                          Área Lesional (px²)
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{result.metrics.control_1_area}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{result.metrics.control_2_area}</td>
                        <td
                          style={{
                            padding: '9px 12px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color:
                              result.metrics.delta_area_percent >= 20 || result.metrics.delta_area_percent <= -30
                                ? '#dc2626'
                                : '#0d9488'
                          }}
                        >
                          {result.metrics.delta_area_percent > 0
                            ? `+${result.metrics.delta_area_percent}%`
                            : `${result.metrics.delta_area_percent}%`}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#0f172a' }}>
                          Circularidad (4πA/P²)
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{result.metrics.control_1_circularity}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{result.metrics.control_2_circularity}</td>
                        <td
                          style={{
                            padding: '9px 12px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: result.metrics.delta_circularity <= -0.08 ? '#d97706' : '#334155'
                          }}
                        >
                          {result.metrics.delta_circularity > 0
                            ? `+${result.metrics.delta_circularity}`
                            : result.metrics.delta_circularity}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Retrieved RAG Context Box */}
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #dce2ec', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #dce2ec',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Database size={13} color="#d97706" />
                      <span style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Evidencia Clínica Recuperada (RAG Híbrido)
                      </span>
                    </div>
                    <span className="mono" style={{ fontSize: '10.5px', color: '#64748b' }}>
                      TOP-K=2 CHUNKS
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{
                      padding: '12px 14px',
                      fontSize: '11.5px',
                      color: '#334155',
                      lineHeight: 1.5,
                      backgroundColor: '#fcfcfd',
                      maxHeight: '135px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {result.retrieved_guidelines}
                  </div>
                </div>
              </div>
            </div>

            {/* FULL CLINICAL REPORT DOSSIER */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #dce2ec' }}>
              <div
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={16} color="#38bdf8" />
                  <span style={{ fontWeight: 600, fontSize: '13.5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Dictamen Asistido de Evolución Dermatológica
                  </span>
                </div>
                <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: '#94a3b8' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                    <CheckCircle2 size={13} /> VALIDADO POR ORQUESTADOR ADK
                  </span>
                  <span>ESTUDIO: {studyId}</span>
                </div>
              </div>

              <div style={{ padding: '24px 28px' }}>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.clinical_report}
                  </ReactMarkdown>
                </div>
              </div>

              <div
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f8fafc',
                  borderTop: '1px solid #dce2ec',
                  fontSize: '11.5px',
                  color: '#64748b',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>
                  NOTA LEGAL: Sistema de apoyo cuantitativo a la decisión clínica. Requiere validación presencial por médico dermatólogo colegiado.
                </span>
                <span className="mono">LEY 20.584 / HIPAA COMPLIANT EDGE</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
