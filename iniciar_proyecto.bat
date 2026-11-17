@echo off
echo ========================================================
echo   Iniciando DermaGuard AI (Backend FastAPI + Frontend)
echo ========================================================

REM Iniciar Backend en una nueva ventana
start "DermaGuard AI - Backend (FastAPI :8000)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

REM Iniciar Frontend en una nueva ventana
start "DermaGuard AI - Frontend (Vite :5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

REM Esperar 3 segundos y abrir el navegador en localhost:5173
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo ========================================================
echo   Servicios lanzados:
echo   - Backend:  http://127.0.0.1:8000
echo   - Frontend: http://localhost:5173
echo ========================================================
