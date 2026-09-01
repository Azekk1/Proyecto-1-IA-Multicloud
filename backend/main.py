from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="DermaGuard AI API",
    description="Backend local para análisis dermatológico",
    version="0.1.0"
)

# Configuración de CORS para permitir peticiones desde React (Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "DermaGuard AI Backend",
        "version": "0.1.0"
    }

@app.get("/api/ping")
def ping():
    return {"message": "pong"}