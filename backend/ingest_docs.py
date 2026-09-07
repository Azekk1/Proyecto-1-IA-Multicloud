import os
import chromadb
from pypdf import PdfReader
from typing import List, Dict

DOCS_DIR = os.path.abspath("../docs")
CHROMA_PATH = "./chroma_db"

def extract_chunks_from_pdf(pdf_path: str, chunk_size: int = 600, overlap: int = 120) -> List[Dict[str, str]]:
    """Extrae texto de un PDF y lo divide en chunks solapados."""
    reader = PdfReader(pdf_path)
    filename = os.path.basename(pdf_path)
    chunks = []
    
    full_text = ""
    for page_num, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            # Limpieza básica de saltos de línea excesivos
            clean_text = " ".join(page_text.split())
            full_text += f" [Pág {page_num + 1}] " + clean_text

    # Partición en ventanas deslizantes
    start = 0
    chunk_index = 0
    text_length = len(full_text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk_str = full_text[start:end].strip()

        if len(chunk_str) > 80:  # Ignorar fragmentos irrelevantes o vacíos
            chunks.append({
                "id": f"{filename}_chunk_{chunk_index}",
                "text": chunk_str,
                "source": filename,
                "chunk_index": chunk_index
            })
            chunk_index += 1

        start += (chunk_size - overlap)

    return chunks

def ingest_all_pdfs():
    """Procesa los PDFs de la carpeta docs e indexa los vectores en ChromaDB."""
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_or_create_collection(
        name="dermatology_guidelines",
        metadata={"hnsw:space": "cosine"}
    )

    pdf_files = [f for f in os.listdir(DOCS_DIR) if f.lower().endswith(".pdf")]
    
    if not pdf_files:
        print(f"No se encontraron archivos PDF en {DOCS_DIR}")
        return

    total_chunks = 0

    for pdf_name in pdf_files:
        pdf_path = os.path.join(DOCS_DIR, pdf_name)
        print(f"Procesando: {pdf_name}...")
        
        chunks = extract_chunks_from_pdf(pdf_path)
        if not chunks:
            print(f"  Advertencia: No se pudo extraer texto de {pdf_name}")
            continue

        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [{"source": c["source"], "chunk_index": c["chunk_index"]} for c in chunks]

        # Inserción o actualización de vectores
        collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas
        )
        print(f"  -> {len(chunks)} fragmentos indexados correctamente.")
        total_chunks += len(chunks)

    print(f"\nIngestión finalizada con éxito. Total de documentos en ChromaDB: {collection.count()}")

if __name__ == "__main__":
    ingest_all_pdfs()