import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from rag import populate_initial_guidelines
from adk_agents import (
    orchestrator_agent,
    list_clinical_records,
    RECENT_TRACES
)

app = FastAPI(
    title="DermaGuard AI - Multi-Agent ADK Clinical API",
    version="2.0.0",
    description="API de Orquestación Multi-Agente (3 Niveles ADK), 2 Knowledge Bases RAG y Persistencia Clínica Segura."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

populate_initial_guidelines()


@app.post("/api/dermatology-analyze")
async def analyze_dermatology(
    file_control_1: UploadFile = File(...),
    file_control_2: UploadFile = File(...),
    roi_1: str = Form(None),
    roi_2: str = Form(None)
):
    try:
        bytes_1 = await file_control_1.read()
        bytes_2 = await file_control_2.read()

        box_1 = json.loads(roi_1) if roi_1 else None
        box_2 = json.loads(roi_2) if roi_2 else None

        result = await orchestrator_agent.execute_pipeline(
            bytes_1=bytes_1,
            bytes_2=bytes_2,
            box_1=box_1,
            box_2=box_2
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clinical-records")
async def get_clinical_records(limit: int = 25):
    """Devuelve los registros clínicos persistidos en la base de datos propia con su hash SHA-256."""
    return {
        "count": len(list_clinical_records(limit)),
        "records": list_clinical_records(limit)
    }


@app.get("/api/observability-logs")
async def get_observability_logs(limit: int = 50):
    """Devuelve las trazas de observabilidad, latencias por agente y eventos de timeout/reintento."""
    traces = RECENT_TRACES[-limit:]
    return {
        "total_events": len(traces),
        "traces": list(reversed(traces))
    }


@app.get("/api/adk-topology")
async def get_adk_topology():
    """Expone la jerarquía activa de 3 niveles de profundidad (9 nodos) en el sistema ADK."""
    return {
        "framework": "Google ADK Multi-Agent Architecture",
        "depth_levels": 3,
        "total_agents": 9,
        "level_1_root": orchestrator_agent.name,
        "level_2_coordinators": [a.name for a in orchestrator_agent.sub_agents],
        "level_3_workers_and_kb_agents": [
            "Guidelines_KB_Agent (KB1: Consenso Melanoma + Guía MINSAL)",
            "Triage_Protocol_Agent (KB2: Protocolos Triage GES + Regresión)",
            "Prompt_Synthesis_Worker (Azure AI Foundry GPT-4o + Retry/Fallback)",
            "Audit_Security_Worker (Tool API Base de Datos Propia SQLite/Pydantic)"
        ]
    }
