import os
import chromadb
from typing import List
from pypdf import PdfReader

DOCS_DIR = os.path.abspath("../docs")
CHROMA_PATH = "./chroma_db"

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
collection = chroma_client.get_or_create_collection(
    name="dermatology_guidelines",
    metadata={"hnsw:space": "cosine"}
)

def populate_initial_guidelines():
    """
    Carga y actualiza:
    1. Las 6 guías clínicas cuantitativas base (umbrales matemáticos).
    2. Los fragmentos extraídos de los PDFs en la carpeta docs/.
    """
    # -------------------------------------------------------------
    # 1. TUS 6 GUÍAS CLÍNICAS CUANTITATIVAS (Semilla / Protocolo Base)
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
            "meta": {"source": "Protocolo ABCDE", "category": "malignancy_expansion", "risk_level": "high"}
        },
        {
            "id": "guide_regression_phenomenon",
            "doc": (
                "Fenómeno de Regresión Lesional: Una reducción abrupta o sustancial del área lesional "
                "(variación negativa superior al -20% o -30%) no siempre indica curación benigna espontánea; "
                "en lesiones pigmentadas atípicas puede representar regresión inmunológica tumoral espontánea, "
                "marcador de alto riesgo en melanoma. Requiere dermatoscopia minuciosa en busca de velo azul-blanquecino o áreas cicatrizales."
            ),
            "meta": {"source": "Criterio de Regresión", "category": "malignancy_regression", "risk_level": "high"}
        },
        {
            "id": "guide_asymmetry_border",
            "doc": (
                "Criterio de Asimetría y Geometría Perimetral: Una disminución marcada en el índice de "
                "circularidad (delta < -0.08 o circularidad absoluta < 0.60) refleja pérdida de tensión superficial, "
                "bordes festoneados, escotaduras o crecimiento radial asimétrico, criterio de atipia estructural."
            ),
            "meta": {"source": "Criterio Morfométrico", "category": "morphology_asymmetry", "risk_level": "moderate_high"}
        },
        {
            "id": "guide_benign_stability",
            "doc": (
                "Estabilidad de Nevos Melanocíticos Benignos: Variaciones de área simétricas y controladas "
                "dentro del rango de +/- 5% con persistencia de un índice de circularidad elevado (> 0.70) "
                "indican comportamiento biológico quiescente y benigno. Se prescribe seguimiento anual fotográfico."
            ),
            "meta": {"source": "Consenso de Nevos Benignos", "category": "benign_stability", "risk_level": "low"}
        },
        {
            "id": "guide_glasgow_checklist",
            "doc": (
                "Lista de Verificación de 7 Puntos de Glasgow: Criterios Mayores (2 puntos c/u): Cambio de tamaño/área, "
                "forma irregular, alteración de color. Criterios Menores (1 punto c/u): Diámetro >= 7mm, inflamación, "
                "exudación/sangrado, alteración sensorial. Una puntuación >= 3 puntos justifica derivación urgente."
            ),
            "meta": {"source": "Escala Glasgow", "category": "triage_score", "risk_level": "clinical_decision"}
        },
        {
            "id": "guide_dysplastic_nevus",
            "doc": (
                "Nevo Displásico / Atípico: Lesiones que presentan asimetría moderada persistente o bordes "
                "levemente difusos pero con área volumétrica estable a lo largo del tiempo. Requieren correlación "
                "con síndrome de nevo displásico y mapeo corporal total cada 6 a 12 meses."
            ),
            "meta": {"source": "Guía Nevo Displásico", "category": "atypical_monitoring", "risk_level": "moderate"}
        }
    ]

    collection.upsert(
        ids=[g["id"] for g in base_guidelines],
        documents=[g["doc"] for g in base_guidelines],
        metadatas=[g["meta"] for g in base_guidelines]
    )

    # -------------------------------------------------------------
    # 2. INGESTA DE DOCUMENTOS COMPLEMENTARIOS (PDFs en docs/)
    # -------------------------------------------------------------
    if os.path.exists(DOCS_DIR):
        pdf_files = [f for f in os.listdir(DOCS_DIR) if f.lower().endswith(".pdf")]
        chunk_size = 500
        overlap = 100

        for pdf_name in pdf_files:
            pdf_path = os.path.join(DOCS_DIR, pdf_name)
            try:
                reader = PdfReader(pdf_path)
                full_text = ""
                for p_num, page in enumerate(reader.pages):
                    t = page.extract_text()
                    if t:
                        full_text += f" [Pág {p_num + 1}] " + " ".join(t.split())

                # Ventana deslizante para particionar el texto
                start = 0
                idx = 0
                pdf_ids, pdf_docs, pdf_metas = [], [], []

                while start < len(full_text):
                    end = min(start + chunk_size, len(full_text))
                    chunk_str = full_text[start:end].strip()

                    if len(chunk_str) > 80:
                        pdf_ids.append(f"{pdf_name}_chunk_{idx}")
                        pdf_docs.append(chunk_str)
                        pdf_metas.append({"source": pdf_name, "chunk_index": idx})
                        idx += 1

                    start += (chunk_size - overlap)

                if pdf_ids:
                    collection.upsert(ids=pdf_ids, documents=pdf_docs, metadatas=pdf_metas)
            except Exception as e:
                print(f"Aviso: No se pudo procesar el PDF {pdf_name}: {e}")

    print(f"ChromaDB sincronizado: {collection.count()} documentos totales indexados (Base + PDFs).")


def query_clinical_guidelines(query_text: str, n_results: int = 2) -> str:
    """Recupera los fragmentos más relevantes citando su fuente (Regla base o PDF)."""
    if collection.count() == 0:
        return "Guía Clínica General: Toda lesión con alteración morfométrica debe ser evaluada por un dermatólogo."

    results = collection.query(
        query_texts=[query_text],
        n_results=min(n_results, collection.count())
    )

    if results["documents"] and results["documents"][0]:
        retrieved_texts = []
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            source = meta.get("source", "Guía Clínica")
            retrieved_texts.append(f"[{source}]: {doc}")
        return "\n\n".join(retrieved_texts)

    return "No se recuperaron guías clínicas coincidentes."


if __name__ == "__main__":
    populate_initial_guidelines()