from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from vision import process_lesion_image, calculate_differential_metrics

app = FastAPI(
    title="DermaGuard AI API",
    description="Backend local para análisis dermatológico diferencial",
    version="0.1.0"
)

# CORS habilitado para conectar con Vite en localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "online", "service": "DermaGuard AI Backend"}

@app.post("/api/dermatology-analyze")
async def analyze_dermatology(
    file_control_1: UploadFile = File(...),
    file_control_2: UploadFile = File(...)
):
    try:
        # Leer los bytes de ambas imágenes
        bytes_1 = await file_control_1.read()
        bytes_2 = await file_control_2.read()

        # 1. Pipeline OpenCV
        metrics_1, mask_img_1 = process_lesion_image(bytes_1)
        metrics_2, mask_img_2 = process_lesion_image(bytes_2)

        # 2. Métricas diferenciales
        diff_metrics = calculate_differential_metrics(metrics_1, metrics_2)

        # 3. Datos simulados de RAG + LLM (los conectaremos con ChromaDB y LM Studio en el siguiente paso)
        mock_guidelines = (
            "Guía Clínica Melanoma ABCDE: Un aumento de área >20% o una pérdida de regularidad/circularidad "
            "en menos de 6 meses requiere derivación dermatológica prioritaria."
        )
        
        mock_report = (
            f"Evaluación Diferencial Automatizada:\n"
            f"- Variación de Área: {diff_metrics['delta_area_percent']}%\n"
            f"- Variación de Circularidad: {diff_metrics['delta_circularity']}\n\n"
            f"Interpretación Preliminar: Se observa una evolución con variación dimensional calculada por OpenCV. "
            f"De acuerdo con las guías clínicas locales, se recomienda validación visual por un especialista."
        )

        return {
            "control_1_image": mask_img_1,
            "control_2_image": mask_img_2,
            "metrics": diff_metrics,
            "retrieved_guidelines": mock_guidelines,
            "clinical_report": mock_report
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))