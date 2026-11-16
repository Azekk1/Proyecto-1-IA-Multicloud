"""
Arquitectura Multi-Agente ADK (3 Niveles de Profundidad) - DermaGuard AI
========================================================================
Implementa la jerarquía de 9 nodos definida en el informe de arquitectura:
- Nivel 1 (Orquestador Raíz):
  * Clinical_Orchestrator_Agent
- Nivel 2 (Coordinadores de Dominio):
  * Vision_Coordinator
  * Clinical_RAG_Coord
  * LLM_Inference_Coord
  * Persistence_Coord
- Nivel 3 (Sub-Agentes Operativos y Tools):
  * Guidelines_KB_Agent (Tool: KB 1 Criterios Clínicos)
  * Triage_Protocol_Agent (Tool: KB 2 Protocolos de Triage y Regresión)
  * Prompt_Synthesis_Worker (Tool: Azure AI Foundry GPT-4o con Retry + Fallback LM Studio)
  * Audit_Security_Worker (Tool: API Segura de Base de Datos Propia con Pydantic)
"""

import os
import time
import uuid
import json
import sqlite3
import hashlib
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable
from pydantic import BaseModel, Field

from vision import process_lesion_image, calculate_differential_metrics
from rag import query_kb1_criterios_clinicos, query_kb2_protocolos_triage
from llm_client import generate_clinical_report

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "dermaguard_clinical.db")
LOG_PATH = os.path.join(BASE_DIR, "dermaguard_observability.log")

# ---------------------------------------------------------------------------
# 1. SISTEMA DE LOGS Y OBSERVABILIDAD (Monitoreo de Agentes, Timeouts y Fallos)
# ---------------------------------------------------------------------------
logger = logging.getLogger("DermaGuard.ADK")
logger.setLevel(logging.INFO)
if not logger.handlers:
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    fh = logging.FileHandler(LOG_PATH, encoding="utf-8")
    fh.setFormatter(formatter)
    sh = logging.StreamHandler()
    sh.setFormatter(formatter)
    logger.addHandler(fh)
    logger.addHandler(sh)

RECENT_TRACES: List[Dict[str, Any]] = []


def emit_agent_log(
    trace_id: str,
    level: str,
    agent_name: str,
    action: str,
    latency_ms: float,
    status: str = "OK",
    detail: str = ""
) -> Dict[str, Any]:
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trace_id": trace_id,
        "adk_level": level,
        "agent": agent_name,
        "action": action,
        "latency_ms": round(latency_ms, 2),
        "status": status,
        "detail": detail
    }
    msg = (
        f"[trace={trace_id}] [{level}] {agent_name} -> {action} | "
        f"{entry['latency_ms']}ms | status={status} {detail}"
    )
    if status in ("ERROR", "TIMEOUT"):
        logger.error(msg)
    elif status in ("RETRY", "FALLBACK"):
        logger.warning(msg)
    else:
        logger.info(msg)

    RECENT_TRACES.append(entry)
    if len(RECENT_TRACES) > 250:
        RECENT_TRACES.pop(0)
    return entry


# ---------------------------------------------------------------------------
# 2. BASE DE DATOS PROPIA Y ESQUEMA DE VALIDACIÓN SEGURA (Pydantic + SQLite)
# ---------------------------------------------------------------------------
class ClinicalEvaluationRecord(BaseModel):
    trace_id: str = Field(..., min_length=6)
    control_1_area: float = Field(..., ge=0.0)
    control_2_area: float = Field(..., ge=0.0)
    delta_area_percent: float
    control_1_circularity: float = Field(..., ge=0.0, le=1.5)
    control_2_circularity: float = Field(..., ge=0.0, le=1.5)
    delta_circularity: float
    triage_level: str
    kb1_sources_used: str
    kb2_sources_used: str
    clinical_report_excerpt: str


def init_clinical_database():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinical_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trace_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                control_1_area REAL NOT NULL,
                control_2_area REAL NOT NULL,
                delta_area_percent REAL NOT NULL,
                control_1_circularity REAL NOT NULL,
                control_2_circularity REAL NOT NULL,
                delta_circularity REAL NOT NULL,
                triage_level TEXT NOT NULL,
                kb1_sources_used TEXT NOT NULL,
                kb2_sources_used TEXT NOT NULL,
                clinical_report_excerpt TEXT NOT NULL,
                integrity_sha256 TEXT NOT NULL
            )
            """
        )
        conn.commit()


init_clinical_database()


def database_write_tool(record: ClinicalEvaluationRecord) -> Dict[str, Any]:
    """
    Tool de escritura segura en base de datos propia invocada por Audit_Security_Worker (Nivel 3).
    Valida el esquema con Pydantic, genera firma SHA-256 de auditoría e inserta de forma parametrizada.
    """
    created_at = datetime.now(timezone.utc).isoformat()
    payload_str = (
        f"{record.trace_id}|{created_at}|{record.delta_area_percent}|"
        f"{record.delta_circularity}|{record.triage_level}"
    )
    integrity_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO clinical_evaluations (
                trace_id, created_at, control_1_area, control_2_area,
                delta_area_percent, control_1_circularity, control_2_circularity,
                delta_circularity, triage_level, kb1_sources_used,
                kb2_sources_used, clinical_report_excerpt, integrity_sha256
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.trace_id,
                created_at,
                record.control_1_area,
                record.control_2_area,
                record.delta_area_percent,
                record.control_1_circularity,
                record.control_2_circularity,
                record.delta_circularity,
                record.triage_level,
                record.kb1_sources_used,
                record.kb2_sources_used,
                record.clinical_report_excerpt[:600],
                integrity_hash
            )
        )
        conn.commit()
        row_id = cur.lastrowid

    return {
        "record_id": row_id,
        "trace_id": record.trace_id,
        "created_at": created_at,
        "integrity_sha256": integrity_hash
    }


def list_clinical_records(limit: int = 25) -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM clinical_evaluations ORDER BY id DESC LIMIT ?", (limit,)
        )
        return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# 3. BASE ADK AGENT Y ESTRUCTURA DE 3 NIVELES DE PROFUNDIDAD
# ---------------------------------------------------------------------------
class ADKAgentNode:
    """Nodo base del grafo de agentes ADK con soporte de sub-agentes, tools y timeouts."""

    def __init__(
        self,
        name: str,
        level: str,
        description: str,
        timeout_sec: float = 15.0,
        sub_agents: Optional[List["ADKAgentNode"]] = None,
        tools: Optional[List[Callable]] = None
    ):
        self.name = name
        self.level = level
        self.description = description
        self.timeout_sec = timeout_sec
        self.sub_agents = sub_agents or []
        self.tools = tools or []


# --- NIVEL 3: SUB-AGENTES DE TAREA OPERATIVA (4 Agentes) ---

class GuidelinesKBAgent(ADKAgentNode):
    def __init__(self):
        super().__init__(
            name="Guidelines_KB_Agent",
            level="ADK-L3",
            description="Consulta especializada en KB 1 (Consenso Melanoma + Guía Clínica MINSAL).",
            timeout_sec=15.0,
            tools=[query_kb1_criterios_clinicos]
        )

    async def run(self, trace_id: str, query: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        try:
            ctx = await asyncio.wait_for(
                asyncio.to_thread(query_kb1_criterios_clinicos, query, 2),
                timeout=self.timeout_sec
            )
            dt = (time.perf_counter() - t0) * 1000
            log = emit_agent_log(
                trace_id, self.level, self.name,
                "query_kb1_criterios_clinicos", dt, "OK", f"chars={len(ctx)}"
            )
            return {"context": ctx, "log": log}
        except asyncio.TimeoutError:
            dt = (time.perf_counter() - t0) * 1000
            log = emit_agent_log(
                trace_id, self.level, self.name,
                "query_kb1_criterios_clinicos", dt, "TIMEOUT",
                f"Excedió límite de {self.timeout_sec}s"
            )
            return {"context": "[KB1 Fallback]: Criterio ABCDE >20% expansión.", "log": log}


class TriageProtocolAgent(ADKAgentNode):
    def __init__(self):
        super().__init__(
            name="Triage_Protocol_Agent",
            level="ADK-L3",
            description="Consulta especializada en KB 2 (Protocolos de Triage GES y Regla de Regresión Tumoral).",
            timeout_sec=15.0,
            tools=[query_kb2_protocolos_triage]
        )

    async def run(self, trace_id: str, query: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.perf_counter()
        delta_area = metrics.get("delta_area_percent", 0.0)
        delta_circ = metrics.get("delta_circularity", 0.0)

        if delta_area <= -30.0:
            triage_level = "NIVEL 1 ROJO (URGENCIA <= 48-72H - ALARMA REGRESIÓN TUMORAL)"
        elif delta_area >= 20.0:
            triage_level = "NIVEL 1/2 ROJO-NARANJO (DERIVACIÓN PRIORITARIA EXPANSIÓN >20%)"
        elif delta_circ <= -0.08:
            triage_level = "NIVEL 3 AMARILLO (CONTROL ADELANTADO <= 30 DÍAS)"
        else:
            triage_level = "NIVEL 4 VERDE (SEGUIMIENTO ANUAL ESTÁNDAR)"

        try:
            ctx = await asyncio.wait_for(
                asyncio.to_thread(query_kb2_protocolos_triage, query, 2),
                timeout=self.timeout_sec
            )
            dt = (time.perf_counter() - t0) * 1000
            log = emit_agent_log(
                trace_id, self.level, self.name,
                "query_kb2_protocolos_triage", dt, "OK", f"triage={triage_level}"
            )
            return {"context": ctx, "triage_level": triage_level, "log": log}
        except asyncio.TimeoutError:
            dt = (time.perf_counter() - t0) * 1000
            log = emit_agent_log(
                trace_id, self.level, self.name,
                "query_kb2_protocolos_triage", dt, "TIMEOUT",
                f"Excedió límite de {self.timeout_sec}s"
            )
            return {"context": "[KB2 Fallback]: Derivación urgente en regresión o expansión.", "triage_level": triage_level, "log": log}


class PromptSynthesisWorker(ADKAgentNode):
    def __init__(self):
        super().__init__(
            name="Prompt_Synthesis_Worker",
            level="ADK-L3",
            description="Ensambla contexto RAG dual e invoca modelo de frontera Azure GPT-4o con reintentos.",
            timeout_sec=45.0,
            tools=[generate_clinical_report]
        )

    async def run(self, trace_id: str, metrics: Dict[str, Any], merged_context: str) -> Dict[str, Any]:
        max_retries = 3
        last_err = ""
        for attempt in range(1, max_retries + 1):
            t0 = time.perf_counter()
            try:
                report = await asyncio.wait_for(
                    generate_clinical_report(metrics, merged_context),
                    timeout=self.timeout_sec
                )
                dt = (time.perf_counter() - t0) * 1000
                status = "OK" if attempt == 1 else "RETRY"
                log = emit_agent_log(
                    trace_id, self.level, self.name,
                    f"invoke_frontier_llm (attempt {attempt}/{max_retries})",
                    dt, status, f"report_chars={len(report)}"
                )
                return {"clinical_report": report, "log": log}
            except Exception as e:
                dt = (time.perf_counter() - t0) * 1000
                last_err = str(e)
                emit_agent_log(
                    trace_id, self.level, self.name,
                    f"invoke_frontier_llm_failed (attempt {attempt}/{max_retries})",
                    dt, "RETRY" if attempt < max_retries else "ERROR", last_err
                )
                if attempt < max_retries:
                    await asyncio.sleep(0.8 * (2 ** (attempt - 1)))

        fallback_text = (
            f"Contingencia activada tras {max_retries} intentos ({last_err}). "
            f"Variación de área calculada: {metrics.get('delta_area_percent')}%, "
            f"variación de circularidad: {metrics.get('delta_circularity')}."
        )
        return {"clinical_report": fallback_text, "log": {"status": "FALLBACK"}}


class AuditSecurityWorker(ADKAgentNode):
    def __init__(self):
        super().__init__(
            name="Audit_Security_Worker",
            level="ADK-L3",
            description="Valida esquema Pydantic y persiste evaluación en Base de Datos propia con SHA-256.",
            timeout_sec=15.0,
            tools=[database_write_tool]
        )

    async def run(
        self,
        trace_id: str,
        metrics: Dict[str, Any],
        triage_level: str,
        kb1_ctx: str,
        kb2_ctx: str,
        report: str
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        record = ClinicalEvaluationRecord(
            trace_id=trace_id,
            control_1_area=float(metrics.get("control_1_area", 0.0)),
            control_2_area=float(metrics.get("control_2_area", 0.0)),
            delta_area_percent=float(metrics.get("delta_area_percent", 0.0)),
            control_1_circularity=float(metrics.get("control_1_circularity", 0.0)),
            control_2_circularity=float(metrics.get("control_2_circularity", 0.0)),
            delta_circularity=float(metrics.get("delta_circularity", 0.0)),
            triage_level=triage_level,
            kb1_sources_used=kb1_ctx[:240],
            kb2_sources_used=kb2_ctx[:240],
            clinical_report_excerpt=report[:500]
        )
        db_res = await asyncio.wait_for(
            asyncio.to_thread(database_write_tool, record),
            timeout=self.timeout_sec
        )
        dt = (time.perf_counter() - t0) * 1000
        log = emit_agent_log(
            trace_id, self.level, self.name,
            "database_write_tool (SQLite/Pydantic)", dt, "OK",
            f"record_id={db_res['record_id']} sha256={db_res['integrity_sha256'][:12]}..."
        )
        return {"db_record": db_res, "log": log}


# --- NIVEL 2: COORDINADORES DE DOMINIO (4 Agentes) ---

class VisionCoordinator(ADKAgentNode):
    def __init__(self):
        super().__init__(
            name="Vision_Coordinator",
            level="ADK-L2",
            description="Coordina segmentación cromática CIE LAB Delta E en el nodo Edge local.",
            timeout_sec=15.0,
            tools=[process_lesion_image, calculate_differential_metrics]
        )

    async def run(
        self,
        trace_id: str,
        bytes_1: bytes,
        bytes_2: bytes,
        box_1: Optional[Dict[str, float]],
        box_2: Optional[Dict[str, float]]
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        m1, mask_1 = await asyncio.wait_for(
            asyncio.to_thread(process_lesion_image, bytes_1, box_1),
            timeout=self.timeout_sec
        )
        m2, mask_2 = await asyncio.wait_for(
            asyncio.to_thread(process_lesion_image, bytes_2, box_2),
            timeout=self.timeout_sec
        )
        diff = calculate_differential_metrics(m1, m2)
        dt = (time.perf_counter() - t0) * 1000
        log = emit_agent_log(
            trace_id, self.level, self.name,
            "edge_cie_lab_morphometry", dt, "OK",
            f"delta_area={diff['delta_area_percent']}% delta_circ={diff['delta_circularity']}"
        )
        return {
            "mask_1": mask_1,
            "mask_2": mask_2,
            "metrics": diff,
            "log": log
        }


class ClinicalRAGCoordinator(ADKAgentNode):
    def __init__(self):
        self.kb1_agent = GuidelinesKBAgent()
        self.kb2_agent = TriageProtocolAgent()
        super().__init__(
            name="Clinical_RAG_Coord",
            level="ADK-L2",
            description="Enruta consultas hacia los sub-agentes de Nivel 3 (KB 1 y KB 2) y fusiona evidencia.",
            timeout_sec=15.0,
            sub_agents=[self.kb1_agent, self.kb2_agent]
        )

    async def run(self, trace_id: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.perf_counter()
        search_query = (
            f"Lesión melanocítica con variación de área {metrics['delta_area_percent']}% "
            f"y cambio de circularidad {metrics['delta_circularity']} en control de 6 meses. "
            f"Criterios ABCDE, regresión tumoral y prioridad de triage."
        )
        res_kb1, res_kb2 = await asyncio.gather(
            self.kb1_agent.run(trace_id, search_query),
            self.kb2_agent.run(trace_id, search_query, metrics)
        )
        merged_context = f"{res_kb1['context']}\n\n{res_kb2['context']}"
        dt = (time.perf_counter() - t0) * 1000
        log = emit_agent_log(
            trace_id, self.level, self.name,
            "fuse_dual_kb_evidence", dt, "OK",
            "KB1 (Consenso/MINSAL) + KB2 (Triage GES) fusionados"
        )
        return {
            "kb1_context": res_kb1["context"],
            "kb2_context": res_kb2["context"],
            "merged_context": merged_context,
            "triage_level": res_kb2["triage_level"],
            "logs": [log, res_kb1["log"], res_kb2["log"]]
        }


class LLMInferenceCoordinator(ADKAgentNode):
    def __init__(self):
        self.synthesis_worker = PromptSynthesisWorker()
        super().__init__(
            name="LLM_Inference_Coord",
            level="ADK-L2",
            description="Supervisa al worker de síntesis clínica y controla resiliencia del modelo frontera.",
            timeout_sec=45.0,
            sub_agents=[self.synthesis_worker]
        )

    async def run(self, trace_id: str, metrics: Dict[str, Any], merged_context: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        worker_res = await self.synthesis_worker.run(trace_id, metrics, merged_context)
        dt = (time.perf_counter() - t0) * 1000
        log = emit_agent_log(
            trace_id, self.level, self.name,
            "coordinate_llm_synthesis", dt, "OK", "Síntesis diagnóstica completada"
        )
        return {
            "clinical_report": worker_res["clinical_report"],
            "logs": [log, worker_res["log"]]
        }


class PersistenceCoordinator(ADKAgentNode):
    def __init__(self):
        self.audit_worker = AuditSecurityWorker()
        super().__init__(
            name="Persistence_Coord",
            level="ADK-L2",
            description="Coordina al sub-agente de auditoría y persistencia segura en base de datos propia.",
            timeout_sec=15.0,
            sub_agents=[self.audit_worker]
        )

    async def run(
        self,
        trace_id: str,
        metrics: Dict[str, Any],
        triage_level: str,
        kb1_ctx: str,
        kb2_ctx: str,
        report: str
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        worker_res = await self.audit_worker.run(
            trace_id, metrics, triage_level, kb1_ctx, kb2_ctx, report
        )
        dt = (time.perf_counter() - t0) * 1000
        log = emit_agent_log(
            trace_id, self.level, self.name,
            "coordinate_db_persistence", dt, "OK",
            f" Guardado seguro ID={worker_res['db_record']['record_id']}"
        )
        return {
            "db_record": worker_res["db_record"],
            "logs": [log, worker_res["log"]]
        }


# --- NIVEL 1: ORQUESTADOR RAÍZ (1 Agente Raíz) ---

class ClinicalOrchestratorAgent(ADKAgentNode):
    """
    Agente Raíz (Nivel 1) de la jerarquía Google ADK de 3 niveles (9 agentes en total).
    Orquesta secuencialmente y en paralelo:
      1. Vision_Coordinator (Nivel 2)
      2. Clinical_RAG_Coord (Nivel 2) -> Guidelines_KB_Agent (N3) + Triage_Protocol_Agent (N3)
      3. LLM_Inference_Coord (Nivel 2) -> Prompt_Synthesis_Worker (N3)
      4. Persistence_Coord (Nivel 2) -> Audit_Security_Worker (N3)
    """

    def __init__(self):
        self.vision_coord = VisionCoordinator()
        self.rag_coord = ClinicalRAGCoordinator()
        self.llm_coord = LLMInferenceCoordinator()
        self.persistence_coord = PersistenceCoordinator()
        super().__init__(
            name="Clinical_Orchestrator_Agent",
            level="ADK-L1",
            description="Orquestador raíz del flujo clínico multi-agente DermaGuard AI.",
            timeout_sec=60.0,
            sub_agents=[
                self.vision_coord,
                self.rag_coord,
                self.llm_coord,
                self.persistence_coord
            ]
        )

    async def execute_pipeline(
        self,
        bytes_1: bytes,
        bytes_2: bytes,
        box_1: Optional[Dict[str, float]],
        box_2: Optional[Dict[str, float]]
    ) -> Dict[str, Any]:
        trace_id = f"adk-{uuid.uuid4().hex[:8]}"
        t_start = time.perf_counter()
        pipeline_logs: List[Dict[str, Any]] = []

        emit_agent_log(
            trace_id, self.level, self.name,
            "start_multi_agent_pipeline", 0.0, "OK",
            "Iniciando orquestación de 3 niveles (9 agentes)"
        )

        # Paso 1: Coordinador de Visión Perimetral (Nivel 2)
        vis_res = await self.vision_coord.run(trace_id, bytes_1, bytes_2, box_1, box_2)
        pipeline_logs.append(vis_res["log"])
        metrics = vis_res["metrics"]

        # Paso 2: Coordinador RAG Clínico (Nivel 2) -> Sub-agentes KB1 y KB2 (Nivel 3)
        rag_res = await self.rag_coord.run(trace_id, metrics)
        pipeline_logs.extend(rag_res["logs"])

        # Paso 3: Coordinador de Inferencia LLM (Nivel 2) -> Worker de Síntesis GPT-4o (Nivel 3)
        llm_res = await self.llm_coord.run(trace_id, metrics, rag_res["merged_context"])
        pipeline_logs.extend(llm_res["logs"])

        # Paso 4: Coordinador de Persistencia (Nivel 2) -> Worker de Auditoría y BD Propia (Nivel 3)
        db_res = await self.persistence_coord.run(
            trace_id,
            metrics,
            rag_res["triage_level"],
            rag_res["kb1_context"],
            rag_res["kb2_context"],
            llm_res["clinical_report"]
        )
        pipeline_logs.extend(db_res["logs"])

        total_ms = (time.perf_counter() - t_start) * 1000
        root_log = emit_agent_log(
            trace_id, self.level, self.name,
            "complete_multi_agent_pipeline", total_ms, "OK",
            f"db_record_id={db_res['db_record']['record_id']}"
        )
        pipeline_logs.append(root_log)

        return {
            "control_1_image": vis_res["mask_1"],
            "control_2_image": vis_res["mask_2"],
            "metrics": metrics,
            "retrieved_guidelines": rag_res["merged_context"],
            "clinical_report": llm_res["clinical_report"],
            "adk_metadata": {
                "trace_id": trace_id,
                "triage_level": rag_res["triage_level"],
                "total_latency_ms": round(total_ms, 2),
                "database_record": db_res["db_record"],
                "agents_executed": len(pipeline_logs),
                "hierarchy_depth": 3
            }
        }


# Instancia singleton del Orquestador Raíz
orchestrator_agent = ClinicalOrchestratorAgent()
