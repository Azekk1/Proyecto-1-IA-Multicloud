# DermaGuard AI — Análisis de Arquitectura MultiCloud, Resiliencia y Costos (Proyecto 2)
> **Curso:** IA MULTICLOUD (TICS867) | **Profesor:** Nicolas Cenzano  
> **Integrantes:** Agustin Zapata, Pietroangelo Zancudi, Tomás Calquín

---

## 1. Arquitectura de Resiliencia Activa-Pasiva (`backend/llm_client.py` y `backend/adk_agents.py`)

El sistema implementa tres anillos de continuidad operativa para garantizar que la estación clínica nunca quede fuera de servicio:

1. **Anillo Primario (Activo — Nube Pública):**
   - **Servicio:** Azure AI Foundry (`gpt-4o`, temperatura `0.25`, `max_tokens=1500`).
   - **Timeout y Reintentos:** Timeout estricto de **45.0 segundos** en el modelo de frontera (y **15.0 segundos** en sub-agentes ADK) con hasta 3 reintentos automáticos mediante *exponential backoff*.
2. **Anillo Secundario (Pasivo — Contingencia Local WAN Off):**
   - **Servicio:** Servidor local **LM Studio** en `http://127.0.0.1:1234/v1/chat/completions`.
   - **Timeout:** **30.0 segundos**. Se activa automáticamente en el bloque `except` si Azure AI Foundry no responde o se pierde el enlace a internet de la clínica.
3. **Anillo Terciario (Respaldo Matemático Determinista):**
   - Si ambos motores LLM estuvieran inactivos, el sistema entrega de forma inmediata el cálculo diferencial obtenido en el nodo Edge por OpenCV ($\Delta\text{Área}\%$ y $\Delta\text{Circularidad}$).

---

## 2. Desglose Económico y Escalabilidad Cloud ($7.36 USD / 1.000 Pacientes)

Gracias a que el procesamiento pesado de visión computacional (segmentación cromática CIE LAB $\Delta E$ + umbralización Otsu) se ejecuta de manera gratuita en el hardware local de la clínica (**Edge Node**), hacia **Azure AI Foundry** únicamente se transmiten vectores numéricos anonimizados y fragmentos de texto ligero (~1.200 tokens de entrada y ~350 tokens de salida por consulta).

### Tabla de Costos Operativos Mensuales en Azure AI Foundry

| Componente Cloud | Métrica de Consumo Mensual (1.000 Consultas) | Tarifa Unitaria Oficial Azure | Costo Mensual (1.000 Pacientes) | Proyección Escalada (10.000 Pacientes) |
| :--- | :--- | :--- | :---: | :---: |
| **Azure OpenAI `gpt-4o` (Inferencia)** | 1,2M tokens Input (`$3.00`) + 350K tokens Output (`$3.50`) | `$2.50` / 1M in • `$10.00` / 1M out | **`$6.50 USD`** | `$65.00 USD` |
| **Embeddings `text-embedding-3-small`** | 2,5M tokens procesados e indexados (50.000 TPM) | `$0.02` / 1M tokens | **`$0.05 USD`** | `$0.50 USD` |
| **Azure AI Search (2 Knowledge Bases)** | Índices vectoriales `KB 1` (Consenso/MINSAL) y `KB 2` (Triage) | Nivel Básico / Consumo compartido | **`$0.80 USD`** | `$8.00 USD` |
| **Azure Key Vault (Gestión de Secretos)** | ~1.500 operaciones de lectura de llaves/tokens HSM | `$0.03` / 10.000 operaciones | **`$0.01 USD`** | `$0.10 USD` |
| **Nodo Perimetral Edge (OpenCV Local)** | Cómputo de imagen CIE LAB $\Delta E$ en estación médica | Hardware clínico existente | **`$0.00 USD`** | `$0.00 USD` |
| **TOTAL MENSUAL ESTIMADO** | **1.000 evaluaciones dermatológicas completas** | **Costo unitario: `$0.0074 USD` / paciente** | **`$7.36 USD / mes`** | **`$73.60 USD / mes`** |

---

## 3. Resumen de Validación Experimental (Golden Set — 70 Casos Clínicos)

Ejecución de 3 corridas independientes sobre `gpt-4o` con temperatura controlada ($T=0.28$) e inyección activa de las 2 Knowledge Bases:

| Corrida Experimental | Casos Evaluados | Aciertos Clínicos | Casos Límite / Discrepancias | Exactitud (Accuracy) |
| :---: | :---: | :---: | :---: | :---: |
| **Corrida 1** | 70 | 58 | 12 | **82.86%** |
| **Corrida 2** | 70 | 61 | 9 | **87.14%** |
| **Corrida 3** | 70 | 63 | 7 | **90.00%** |
| **Promedio Global** | **70** | **60.7** | **9.3** | **86.67%** |
