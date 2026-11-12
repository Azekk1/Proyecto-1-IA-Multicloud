import os
import httpx
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1/chat/completions")

async def generate_clinical_report(metrics: Dict[str, Any], guidelines_context: str) -> str:
    """
    Genera el informe clínico con Azure OpenAI (gpt-4o en Azure AI Foundry).
    Si la nube no responde o hay fallo de red, aplica fallback automático
    al servidor local de LM Studio y finalmente a una evaluación matemática de respaldo.
    """
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

    # 1. Intento primario: Azure OpenAI (gpt-4o en Azure AI Foundry)
    if AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY:
        azure_base = AZURE_OPENAI_ENDPOINT.rstrip('/')
        azure_url = f"{azure_base}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}"
        headers = {
            "api-key": AZURE_OPENAI_API_KEY,
            "Content-Type": "application/json"
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(azure_url, headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as azure_err:
            print(f"[Aviso Resiliencia] Fallo en Azure OpenAI: {azure_err}. Intentando fallback local...")

    # 2. Intento secundario (Fallback local): LM Studio
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(LM_STUDIO_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return (
            f"Aviso de Sistema: Servidores de inferencia (Azure AI Foundry y LM Studio local) no disponibles.\n"
            f"Detalle técnico: {str(e)}\n\n"
            f"[Evaluación Matemática de Respaldo]:\n"
            f"El análisis de OpenCV calculó una variación de área de {metrics.get('delta_area_percent')}% "
            f"y un cambio de circularidad de {metrics.get('delta_circularity')}."
        )