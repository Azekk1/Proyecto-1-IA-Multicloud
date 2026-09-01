from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from vision import process_lesion_image, calculate_differential_metrics
from rag import populate_initial_guidelines, query_clinical_guidelines
from llm_client import generate_clinical_report

app = FastAPI(
    title="DermaGuard AI API",
    description="Backend local para análisis dermatológico diferencial con RAG y LLM",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar base de datos vectorial con guías clínicas
populate_initial_guidelines()

@app.get("/")
def health_check():
    return {"status": "online", "service": "DermaGuard AI Engine"}

@app.post("/api/dermatology-analyze")
async def analyze_dermatology(
    file_control_1: UploadFile = File(...),
    file_control_2: UploadFile = File(...)
):
    try:
        # 1. Extracción de imágenes
        bytes_1 = await file_control_1.read()
        bytes_2 = await file_control_2.read()

        # 2. Pipeline de Visión Computacional (OpenCV)
        metrics_1, mask_1 = process_lesion_image(bytes_1)
        metrics_2, mask_2 = process_lesion_image(bytes_2)
        diff_metrics = calculate_differential_metrics(metrics_1, metrics_2)

        # 3. Recuperación de Información RAG (ChromaDB)
        search_query = (
            f"Lesión con cambio de área {diff_metrics['delta_area_percent']}% "
            f"y cambio de circularidad {diff_metrics['delta_circularity']}"
        )
        retrieved_context = query_clinical_guidelines(search_query, n_results=1)

        # 4. Generación de Reporte Clínico (LM Studio)
        clinical_report = await generate_clinical_report(diff_metrics, retrieved_context)

        return {
            "control_1_image": mask_1,
            "control_2_image": mask_2,
            "metrics": diff_metrics,
            "retrieved_guidelines": retrieved_context,
            "clinical_report": clinical_report
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))