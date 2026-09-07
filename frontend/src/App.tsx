import React, { useState, useRef } from 'react';
import type { DermatologyAnalysisResponse } from './dermatology';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<DermatologyAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef1 = useRef<HTMLInputElement | null>(null);
  const inputRef2 = useRef<HTMLInputElement | null>(null);

  // Estados de arrastre en lienzo
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

  // Coordenadas relativas (0.0 a 1.0)
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

    // Si no se dibujó recuadro, usa la zona central por defecto
    const effectiveBox1 = box1 || { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    formData.append('roi_1', JSON.stringify(effectiveBox1));

    if (noLesion2) {
      formData.append('roi_2', JSON.stringify({ x: 0, y: 0, w: 0, h: 0 }));
    } else {
      const effectiveBox2 = box2 || { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
      formData.append('roi_2', JSON.stringify(effectiveBox2));
    }

    try {
      const response = await fetch('http://localhost:8000/api/dermatology-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || `Error HTTP ${response.status}`);
      }

      const data: DermatologyAnalysisResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error al procesar con el backend local.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, sans-serif', color: '#1e293b' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>
            DermaGuard AI 🔬🛡️
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Segmentación Asistida GrabCut + Inferencia Clínica Local
          </p>
        </div>
        {(file1 || file2 || result) && (
          <button
            onClick={handleReset}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
          >
            🔄 Nuevo Análisis / Limpiar
          </button>
        )}
      </header>

      {/* Instrucción visual */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13.5px', color: '#166534' }}>
        💡 <strong>Instrucción:</strong> Haz clic y arrastra sobre la foto para encerrar la lesión en un recuadro. GrabCut extraerá los límites exactos ignorando sombras o vello.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Control 1 */}
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '16px', background: '#f8fafc', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Control Inicial (Mes 1)</h3>
          <input ref={inputRef1} type="file" accept="image/*" id="c1" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 1)} />
          {!preview1 ? (
            <label htmlFor="c1" style={{ cursor: 'pointer', padding: '8px 16px', background: '#e2e8f0', borderRadius: '6px', fontSize: '14px', fontWeight: '500' }}>
              📁 Cargar Imagen
            </label>
          ) : (
            <div>
              <div
                style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', userSelect: 'none' }}
                onMouseDown={(e) => handleMouseDown(e, 1)}
                onMouseMove={(e) => handleMouseMove(e, 1)}
                onMouseUp={() => handleMouseUp(1)}
              >
                <img src={preview1} alt="Control 1" style={{ maxHeight: '250px', maxWidth: '100%', borderRadius: '6px', pointerEvents: 'none' }} />
                {box1 && box1.w > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      border: '2px solid #2563eb',
                      backgroundColor: 'rgba(37, 99, 235, 0.2)',
                      left: `${box1.x * 100}%`,
                      top: `${box1.y * 100}%`,
                      width: `${box1.w * 100}%`,
                      height: `${box1.h * 100}%`,
                      pointerEvents: 'none'
                    }}
                  />
                )}
              </div>
              <div style={{ marginTop: '8px' }}>
                <button onClick={() => setBox1(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                  Rehacer recuadro
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Control 2 */}
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '16px', background: '#f8fafc', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Control Posterior (Mes 6)</h3>
          <input ref={inputRef2} type="file" accept="image/*" id="c2" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 2)} />
          {!preview2 ? (
            <label htmlFor="c2" style={{ cursor: 'pointer', padding: '8px 16px', background: '#e2e8f0', borderRadius: '6px', fontSize: '14px', fontWeight: '500' }}>
              📁 Cargar Imagen
            </label>
          ) : (
            <div>
              {!noLesion2 ? (
                <div
                  style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', userSelect: 'none' }}
                  onMouseDown={(e) => handleMouseDown(e, 2)}
                  onMouseMove={(e) => handleMouseMove(e, 2)}
                  onMouseUp={() => handleMouseUp(2)}
                >
                  <img src={preview2} alt="Control 2" style={{ maxHeight: '250px', maxWidth: '100%', borderRadius: '6px', pointerEvents: 'none' }} />
                  {box2 && box2.w > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        border: '2px solid #2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.2)',
                        left: `${box2.x * 100}%`,
                        top: `${box2.y * 100}%`,
                        width: `${box2.w * 100}%`,
                        height: `${box2.h * 100}%`,
                        pointerEvents: 'none'
                      }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '6px', color: '#166534', fontWeight: '600' }}>
                  ✓ Lesión ausente / Remisión completa
                </div>
              )}
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <label style={{ fontSize: '12px', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="checkbox"
                    checked={noLesion2}
                    onChange={(e) => {
                      setNoLesion2(e.target.checked);
                      if (e.target.checked) setBox2(null);
                    }}
                  />
                  Sin lesión visible (Remisión / Exéresis)
                </label>
                {!noLesion2 && (
                  <button onClick={() => setBox2(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Rehacer recuadro
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <button
          onClick={handleAnalyze}
          disabled={!file1 || !file2 || loading}
          style={{
            padding: '12px 32px',
            fontSize: '15px',
            fontWeight: '600',
            backgroundColor: (!file1 || !file2 || loading) ? '#94a3b8' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: (!file1 || !file2 || loading) ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Calculando GrabCut y redactando informe...' : 'Ejecutar Análisis Diferencial'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', color: '#991b1b', marginBottom: '20px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#475569' }}>Segmentación GrabCut - Control 1</h4>
              <img src={result.control_1_image} alt="GrabCut 1" style={{ width: '100%', borderRadius: '6px' }} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#475569' }}>Segmentación GrabCut - Control 2</h4>
              <img src={result.control_2_image} alt="GrabCut 2" style={{ width: '100%', borderRadius: '6px' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#166534', fontSize: '14px' }}>📊 Métricas Diferenciales</h4>
              <p style={{ margin: '3px 0', fontSize: '13.5px' }}>
                <strong>Δ Variación de Área:</strong> {result.metrics.delta_area_percent > 0 ? `+${result.metrics.delta_area_percent}` : result.metrics.delta_area_percent}%
              </p>
              <p style={{ margin: '3px 0', fontSize: '13.5px' }}>
                <strong>Δ Circularidad:</strong> {result.metrics.delta_circularity}
              </p>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#334155', fontSize: '14px' }}>📚 Contexto RAG Recuperado</h4>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', fontStyle: 'italic', lineHeight: '1.4' }}>
                {result.retrieved_guidelines}
              </p>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
              📋 Reporte de Evolución Clínica
            </h3>
            <div className="markdown-body" style={{ lineHeight: '1.7', color: '#334155', fontSize: '14px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.clinical_report}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}