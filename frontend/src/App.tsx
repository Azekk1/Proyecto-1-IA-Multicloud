import React, { useState } from 'react';
import type { DermatologyAnalysisResponse } from './dermatology';

export default function App() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<DermatologyAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    controlNum: 1 | 2
  ) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (controlNum === 1) {
      setFile1(file);
      setPreview1(url);
    } else {
      setFile2(file);
      setPreview2(url);
    }
  };

  const handleAnalyze = async () => {
    if (!file1 || !file2) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file_control_1', file1);
    formData.append('file_control_2', file2);

    try {
      const response = await fetch('http://localhost:8000/api/dermatology-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => null);
        throw new Error(errDetail?.detail || `Error en el servidor (${response.status})`);
      }

      const data: DermatologyAnalysisResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servidor local de FastAPI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>
          DermaGuard AI
        </h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>
          Seguimiento Dermatológico Diferencial Local & Privado
        </p>
      </header>

      {/* Carga de Imágenes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px', color: '#334155' }}>Control Inicial (Mes 1)</h3>
          <input
            type="file"
            accept="image/*"
            id="control1"
            style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e, 1)}
          />
          <label htmlFor="control1" style={{ cursor: 'pointer', display: 'inline-block', padding: '8px 16px', background: '#e2e8f0', borderRadius: '6px', fontSize: '14px', fontWeight: 500 }}>
            📁 Seleccionar Imagen
          </label>
          {preview1 && (
            <div style={{ marginTop: '15px' }}>
              <img src={preview1} alt="Control 1" style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
              <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0 0' }}>{file1?.name}</p>
            </div>
          )}
        </div>

        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '20px', textAlign: 'center', background: '#f8fafc' }}>
          <h3 style={{ marginTop: 0, fontSize: '15px', color: '#334155' }}>Control Posterior (Mes 6)</h3>
          <input
            type="file"
            accept="image/*"
            id="control2"
            style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e, 2)}
          />
          <label htmlFor="control2" style={{ cursor: 'pointer', display: 'inline-block', padding: '8px 16px', background: '#e2e8f0', borderRadius: '6px', fontSize: '14px', fontWeight: 500 }}>
            📁 Seleccionar Imagen
          </label>
          {preview2 && (
            <div style={{ marginTop: '15px' }}>
              <img src={preview2} alt="Control 2" style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
              <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0 0' }}>{file2?.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Botón de Ejecución */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <button
          onClick={handleAnalyze}
          disabled={!file1 || !file2 || loading}
          style={{
            padding: '12px 30px',
            fontSize: '15px',
            fontWeight: '600',
            backgroundColor: (!file1 || !file2 || loading) ? '#94a3b8' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: (!file1 || !file2 || loading) ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Calculando métricas con OpenCV...' : 'Ejecutar Análisis Diferencial'}
        </button>
      </div>

      {/* Mensaje de Error */}
      {error && (
        <div style={{ padding: '14px', background: '#fee2e2', border: '1px solid #f87171', borderRadius: '8px', color: '#991b1b', marginBottom: '25px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Resultados Visuales y Métricas */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>Segmentación OpenCV - Control 1</h4>
              <img src={result.control_1_image} alt="Segmentación Control 1" style={{ width: '100%', borderRadius: '6px' }} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>Segmentación OpenCV - Control 2</h4>
              <img src={result.control_2_image} alt="Segmentación Control 2" style={{ width: '100%', borderRadius: '6px' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#166534', fontSize: '15px' }}>📊 Métricas Calculadas</h4>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>
                <strong>Δ Variación de Área:</strong> {result.metrics.delta_area_percent > 0 ? `+${result.metrics.delta_area_percent}` : result.metrics.delta_area_percent}%
              </p>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>
                <strong>Δ Variación de Circularidad:</strong> {result.metrics.delta_circularity}
              </p>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#334155', fontSize: '15px' }}>📚 Guías Clínicas RAG</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontStyle: 'italic', lineHeight: '1.4' }}>
                {result.retrieved_guidelines}
              </p>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#0f172a' }}>
              📋 Reporte de Evolución Clínica
            </h3>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155', fontSize: '14px' }}>
              {result.clinical_report}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}