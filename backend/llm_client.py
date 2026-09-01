import httpx
from typing import Dict, Any

LM_STUDIO_URL = "http://127.0.0.1:1234/v1/chat/completions"

async def generate_clinical_report(metrics: Dict[str, Any], guidelines_context: str) -> str:
    """Envía el prompt estructurado al servidor local de LM Studio."""
    prompt = f"""Eres un asistente de apoyo al diagnóstico dermatológico clínico. Analiza la siguiente evolución entre dos controles fotográficos.

### Datos Cuantitativos (OpenCV):
- Variación de Área: {metrics.get('delta_area_percent')}%
- Variación de Circularidad: {metrics.get('delta_circularity')}
- Área Control 1: {metrics.get('control_1_area')} px | Control 2: {metrics.get('control_2_area')} px

### Literatura Clínica Recuperada (ChromaDB RAG):
{guidelines_context}

### Instrucciones:
1. Resume la evolución morfológica y dimensional detectada.
2. Compara los deltas obtenidos contra las guías clínicas recuperadas.
3. Proporciona una conclusión técnica preliminar y recomendación de conducta médica (e.g., observación, dermatoscopia o biopsia).
4. Emplea un formato estructurado con viñetas claras y tono médico profesional.
"""

    payload = {
        "messages": [
            {"role": "system", "content": "Eres un asistente clínico experto en dermatología cuantitativa."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.25,
        "max_tokens": 1500
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(LM_STUDIO_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return (
            f"Aviso de Sistema: Servidor LM Studio local no detectado en http://127.0.0.1:1234.\n"
            f"Detalle técnico: {str(e)}\n\n"
            f"[Evaluación Matemática de Respaldo]:\n"
            f"El análisis de OpenCV calculó una variación de área de {metrics.get('delta_area_percent')}% "
            f"y un cambio de circularidad de {metrics.get('delta_circularity')}."
        )