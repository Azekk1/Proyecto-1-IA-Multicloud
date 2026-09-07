import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from vision import process_lesion_image, calculate_differential_metrics
from rag import populate_initial_guidelines, query_clinical_guidelines
from llm_client import generate_clinical_report

app = FastAPI(title="DermaGuard AI API", version="1.2.0")

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

        metrics_1, mask_1 = process_lesion_image(bytes_1, roi_box=box_1)
        metrics_2, mask_2 = process_lesion_image(bytes_2, roi_box=box_2)
        diff_metrics = calculate_differential_metrics(metrics_1, metrics_2)

        # RAG con guías base y PDFs indexados
        search_query = (
            f"Lesión con cambio de área {diff_metrics['delta_area_percent']}% "
            f"y variación de circularidad {diff_metrics['delta_circularity']}"
        )
        retrieved_context = query_clinical_guidelines(search_query, n_results=2)

        # Informe generado por el modelo local
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