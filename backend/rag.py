import os
import chromadb
from pypdf import PdfReader

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "docs"))
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

# Knowledge Base 1: Criterios Clínicos (Consenso Melanoma + Guía MINSAL + 6 Reglas Base)
kb1_collection = chroma_client.get_or_create_collection(
    name="dermatology_guidelines",
    metadata={"hnsw:space": "cosine"}
)

# Knowledge Base 2: Protocolos de Triage y Derivación GES (protocolo_triage_urgencia_dermatologia.md)
kb2_collection = chroma_client.get_or_create_collection(
    name="triage_protocols_kb",
    metadata={"hnsw:space": "cosine"}
)


def populate_initial_guidelines():
    """
    Sincroniza las 2 Knowledge Bases locales espejo de Azure AI Search:
    - KB 1 (kb-criterios-clinicos): 6 reglas cuantitativas + consenso.pdf + guia.pdf.
    - KB 2 (kb-protocolos-triage): protocolo_triage_urgencia_dermatologia.md.
    """
    # -------------------------------------------------------------
    # 1. KB 1: REGLAS CLÍNICAS CUANTITATIVAS + PDFs CLÍNICOS
    # -------------------------------------------------------------
    base_guidelines = [
        {
            "id": "guide_evolution_melanoma",
            "doc": (
                "Criterio ABCDE - Evolución Rápida y Expansión: Un incremento dimensional del área "
                "superior al 20% en un intervalo semestral es un signo cardinal de sospecha "
                "de transformación maligna (Melanoma de extensión superficial o nodular). "
                "Exige derivación prioritaria a dermatoscopia digital y eventual escisión con margen."
            ),
            "meta": {"source": "KB1: Protocolo ABCDE", "category": "malignancy_expansion", "risk_level": "high"}
        },
        {
            "id": "guide_regression_phenomenon",
            "doc": (
                "Fenómeno de Regresión Lesional: Una reducción abrupta o sustancial del área lesional "
                "(variación negativa superior al -20% o -30%) no siempre indica curación benigna espontánea; "
                "en lesiones pigmentadas atípicas puede representar regresión inmunológica tumoral espontánea, "
                "marcador de alto riesgo en melanoma. Requiere dermatoscopia minuciosa en busca de velo azul-blanquecino o áreas cicatrizales."
            ),
            "meta": {"source": "KB1: Criterio de Regresión", "category": "malignancy_regression", "risk_level": "high"}
        },
        {
            "id": "guide_asymmetry_border",
            "doc": (
                "Criterio de Asimetría y Geometría Perimetral: Una disminución marcada en el índice de "
                "circularidad (delta < -0.08 o circularidad absoluta < 0.60) refleja pérdida de tensión superficial, "
                "bordes festoneados, escotaduras o crecimiento radial asimétrico, criterio de atipia estructural."
            ),
            "meta": {"source": "KB1: Criterio Morfométrico", "category": "morphology_asymmetry", "risk_level": "moderate_high"}
        },
        {
            "id": "guide_benign_stability",
            "doc": (
                "Estabilidad de Nevos Melanocíticos Benignos: Variaciones de área simétricas y controladas "
                "dentro del rango de +/- 5% con persistencia de un índice de circularidad elevado (> 0.70) "
                "indican comportamiento biológico quiescente y benigno. Se prescribe seguimiento anual fotográfico."
            ),
            "meta": {"source": "KB1: Consenso Nevos Benignos", "category": "benign_stability", "risk_level": "low"}
        },
        {
            "id": "guide_glasgow_checklist",
            "doc": (
                "Lista de Verificación de 7 Puntos de Glasgow: Criterios Mayores (2 puntos c/u): Cambio de tamaño/área, "
                "forma irregular, alteración de color. Criterios Menores (1 punto c/u): Diámetro >= 7mm, inflamación, "
                "exudación/sangrado, alteración sensorial. Una puntuación >= 3 puntos justifica derivación urgente."
            ),
            "meta": {"source": "KB1: Escala Glasgow", "category": "triage_score", "risk_level": "clinical_decision"}
        },
        {
            "id": "guide_dysplastic_nevus",
            "doc": (
                "Nevo Displásico / Atípico: Lesiones que presentan asimetría moderada persistente o bordes "
                "levemente difusos pero con área volumétrica estable a lo largo del tiempo. Requieren correlación "
                "con síndrome de nevo displásico y mapeo corporal total cada 6 a 12 meses."
            ),
            "meta": {"source": "KB1: Guía Nevo Displásico", "category": "atypical_monitoring", "risk_level": "moderate"}
        }
    ]

    kb1_collection.upsert(
        ids=[g["id"] for g in base_guidelines],
        documents=[g["doc"] for g in base_guidelines],
        metadatas=[g["meta"] for g in base_guidelines]
    )

    # Indexar únicamente los PDFs clínicos oficiales en KB 1 (si aún no están indexados)
    clinical_pdfs = ["consenso.pdf", "guia.pdf"]
    if kb1_collection.count() <= len(base_guidelines) and os.path.exists(DOCS_DIR):
        chunk_size = 500
        overlap = 100
        for pdf_name in clinical_pdfs:
            pdf_path = os.path.join(DOCS_DIR, pdf_name)
            if not os.path.exists(pdf_path):
                continue
            try:
                reader = PdfReader(pdf_path)
                full_text = ""
                for p_num, page in enumerate(reader.pages):
                    t = page.extract_text()
                    if t:
                        full_text += f" [Pág {p_num + 1}] " + " ".join(t.split())

                start = 0
                idx = 0
                pdf_ids, pdf_docs, pdf_metas = [], [], []
                while start < len(full_text):
                    end = min(start + chunk_size, len(full_text))
                    chunk_str = full_text[start:end].strip()
                    if len(chunk_str) > 80:
                        pdf_ids.append(f"{pdf_name}_chunk_{idx}")
                        pdf_docs.append(chunk_str)
                        pdf_metas.append({"source": f"KB1: {pdf_name}", "chunk_index": idx})
                        idx += 1
                    start += (chunk_size - overlap)

                if pdf_ids:
                    kb1_collection.upsert(ids=pdf_ids, documents=pdf_docs, metadatas=pdf_metas)
            except Exception as e:
                print(f"Aviso: No se pudo procesar el PDF {pdf_name}: {e}")

    # -------------------------------------------------------------
    # 2. KB 2: PROTOCOLOS DE TRIAGE Y DERIVACIÓN ONCOLÓGICA (.md)
    # -------------------------------------------------------------
    triage_md_path = os.path.join(DOCS_DIR, "protocolo_triage_urgencia_dermatologia.md")
    if os.path.exists(triage_md_path):
        try:
            with open(triage_md_path, "r", encoding="utf-8") as f:
                md_text = f.read()

            sections = [s.strip() for s in md_text.split("## ") if len(s.strip()) > 40]
            kb2_ids, kb2_docs, kb2_metas = [], [], []
            for idx, sec in enumerate(sections):
                kb2_ids.append(f"kb2_triage_sec_{idx}")
                kb2_docs.append("## " + sec)
                kb2_metas.append({
                    "source": "KB2: protocolo_triage_urgencia_dermatologia.md",
                    "section": idx
                })
            if kb2_ids:
                kb2_collection.upsert(ids=kb2_ids, documents=kb2_docs, metadatas=kb2_metas)
        except Exception as e:
            print(f"Aviso: No se pudo indexar KB 2 ({triage_md_path}): {e}")

    print(
        f"Knowledge Bases sincronizadas -> KB1 (Criterios Clínicos): {kb1_collection.count()} chunks | "
        f"KB2 (Protocolos Triage): {kb2_collection.count()} secciones."
    )


def query_kb1_criterios_clinicos(query_text: str, n_results: int = 2) -> str:
    """Agente Nivel 3 (Guidelines_KB_Agent): Consulta KB 1 (Consenso Melanoma + Guía MINSAL)."""
    if kb1_collection.count() == 0:
        return "[KB1: Guía Clínica]: Toda lesión con alteración morfométrica debe ser evaluada por un dermatólogo."

    results = kb1_collection.query(
        query_texts=[query_text],
        n_results=min(n_results, kb1_collection.count())
    )
    if results["documents"] and results["documents"][0]:
        items = []
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            src = meta.get("source", "KB1: Criterios Clínicos")
            items.append(f"[{src}]: {doc}")
        return "\n\n".join(items)
    return "No se recuperaron fragmentos en KB 1."


def query_kb2_protocolos_triage(query_text: str, n_results: int = 2) -> str:
    """Agente Nivel 3 (Triage_Protocol_Agent): Consulta KB 2 (Protocolos de Triage y Regresión)."""
    if kb2_collection.count() == 0:
        return "[KB2: Triage]: Prioridad Nivel 1 (Rojo <= 48-72h) en expansión >20% o regresión <= -30%."

    results = kb2_collection.query(
        query_texts=[query_text],
        n_results=min(n_results, kb2_collection.count())
    )
    if results["documents"] and results["documents"][0]:
        items = []
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            src = meta.get("source", "KB2: Protocolos Triage")
            items.append(f"[{src}]: {doc}")
        return "\n\n".join(items)
    return "No se recuperaron protocolos en KB 2."


def query_clinical_guidelines(query_text: str, n_results: int = 2) -> str:
    """Fusión de evidencia desde KB 1 y KB 2."""
    ctx_kb1 = query_kb1_criterios_clinicos(query_text, n_results=n_results)
    ctx_kb2 = query_kb2_protocolos_triage(query_text, n_results=1)
    return f"{ctx_kb1}\n\n{ctx_kb2}"


if __name__ == "__main__":
    populate_initial_guidelines()
