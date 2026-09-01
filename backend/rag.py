import chromadb
from typing import List

# Inicializar cliente persistente en disco local
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# Obtener o crear colección con métrica de similitud coseno
collection = chroma_client.get_or_create_collection(
    name="dermatology_guidelines",
    metadata={"hnsw:space": "cosine"}
)

def populate_initial_guidelines():
    """Carga guías clínicas oficiales si la colección local está vacía."""
    if collection.count() == 0:
        documents = [
            (
                "Criterio ABCDE - Evolución y Diámetro: Un incremento dimensional del área superior al 20% "
                "en un intervalo de 6 meses o un diámetro mayor a 6mm es un signo cardinal de sospecha "
                "de transformación maligna (Melanoma). Requiere derivación prioritaria para dermatoscopia digital."
            ),
            (
                "Criterio de Asimetría y Regularidad: La pérdida de circularidad (delta de circularidad < -0.08) "
                "indica irregularidad en los bordes o crecimiento asimétrico invasivo, criterio compatible "
                "con lesión atípica que amerita biopsia escisional diagnóstica."
            ),
            (
                "Estabilidad de Lesiones Benignas: Variaciones de área menores al 5% con conservación de la "
                "circularidad (índice > 0.70) sugieren estabilidad en nevos melanocíticos comunes. "
                "Se recomienda seguimiento fotográfico de rutina cada 12 meses."
            )
        ]
        ids = ["guide_evolution_melanoma", "guide_asymmetry_border", "guide_benign_stability"]
        metadatas = [
            {"category": "malignancy_risk", "importance": "high"},
            {"category": "morphology_asymmetry", "importance": "high"},
            {"category": "benign_stability", "importance": "medium"}
        ]
        
        collection.add(
            documents=documents,
            ids=ids,
            metadatas=metadatas
        )

def query_clinical_guidelines(query_text: str, n_results: int = 1) -> str:
    """Busca en ChromaDB los lineamientos clínicos más afines al patrón evolutivo."""
    results = collection.query(
        query_texts=[query_text],
        n_results=n_results
    )
    if results["documents"] and results["documents"][0]:
        return " \n".join(results["documents"][0])
    return "Guía Clínica General: Toda lesión con alteración morfométrica debe ser evaluada por un dermatólogo."