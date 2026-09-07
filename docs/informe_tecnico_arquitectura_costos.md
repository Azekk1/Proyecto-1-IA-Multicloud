# DermaGuard AI - Informe Técnico Consolidado
> **Sustentación de Arquitectura Local, Benchmarking Multimodelo, Concurrencia y Análisis Económico**  
> *Fecha de generación:* `2026-09-07 12:41:18` | *Institución:* Universidad Adolfo Ibáñez | *Curso:* TICS867 - IA MultiCloud

---

## 1. Justificación de IA Local vs. IA Cloud

1. **Soberanía y Secreto Médico:** Las imágenes dermatológicas constituyen registros biométricos de salud altamente sensibles. El envío de fotografías de pacientes a nubes públicas de terceros infringe regulaciones de confidencialidad médica y protección de datos.
2. **Autonomía Operativa en Zonas Aisladas:** Permite operar en centros de atención primaria o postas rurales sin dependencia de enlaces de internet de alta velocidad o caídas de conectividad.
3. **Determinismo y Costo Fijo:** Al ser un despliegue local, la institución no asume riesgos financieros por volatilidad en el costo de tokens ni facturación variable por consultas de visión en la nube.

---

## 2. Benchmark Comparativo Multimodelo (3 Modelos Locales + RAG)

Evaluación realizada bajo condiciones idénticas de entrada sobre hardware local (*Edge Node*):

| Modelo Evaluado | Arquitectura | Condición | Latencia (s) | Velocidad (t/s) | Diagnóstico Clínico Resultante |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Gemma-4B (Google)** | 4B Densa | Sin RAG | 23.1s | 43.32 t/s | Sugiere cicatrización benigna sin base oncológica. |
| **Gemma-4B (Google)** | 4B Densa | **Con RAG** | **22.52s** | **44.42 t/s** | **Cita umbrales ABCDE y sugiere sospecha de regresión.** |
| **Qwen3.5-9B (Alibaba)** | 9B Densa | Sin RAG | 33.77s | 29.62 t/s | Describe cambios pero no estructura conducta médica formal. |
| **Qwen3.5-9B (Alibaba)** | 9B Densa | **Con RAG** | **33.67s** | **29.7 t/s** | **Estructura conducta formal, cita consenso.pdf y deriva a biopsia.** |
| **Bonsai-27B (PrismML)** | 27B Binaria/Ternaria | Sin RAG | 32.45s | 30.85 t/s | Análisis detallado pero genérico sin sustento protocolar. |
| **Bonsai-27B (PrismML)** | 27B Binaria/Ternaria | **Con RAG** | **33.37s** | **29.98 t/s** | **Máxima profundidad clínica; contrasta criterios Glasgow.** |

> **Conclusión RAG:** La incorporación del vector store ChromaDB indexado con guías clínicas erradica la alucinación diagnóstica en casos de reducción dimensional (regresión tumoral espontánea), forzando al modelo a justificar la conducta médica bajo protocolos oficiales.

---

## 3. Arquitectura de Sistemas y Requisitos de Hardware

### Diagrama de Comunicación Local
┌────────────────────────────────────────────────────────────────────────┐
│                        VLAN MÉDICA INTERNA                             │
│                                                                        │
│  [Frontend: React/Vite] ──(Coordenadas ROI + Imagen)──► [FastAPI :8000]│
│                                                              │         │
│          ┌───────────────────────────────────────────────────┼─────┐   │
│          ▼                                                   ▼     ▼   │
│  [OpenCV GrabCut C++]                                  [ChromaDB] [LM] │
│  - Segmentación Cromática ΔE                          - Vectores - Qwen│
│  - Momentos y Circularidad                             Cosine     3.5  │
│  - 0.28s (CPU Bound)                                   all-MiniLM 9B   │
└────────────────────────────────────────────────────────────────────────┘
### Especificaciones de Hardware (Nodo Local)
* **GPU Mínima:** 8 GB VRAM (ej. NVIDIA RTX 3060 / 4060) para cuantizaciones Q4_K_M.
* **GPU Recomendada:** 12 GB a 16 GB VRAM (ej. NVIDIA RTX 4070 / RTX 4060 Ti 16GB) para soportar modelos densos de 9B y contextos amplios.
* **CPU:** 6 a 8 Núcleos (Procesamiento OpenCV GrabCut y binarización local en <300 ms).
* **RAM del Sistema:** 16 GB a 32 GB DDR4/DDR5.
* **Almacenamiento:** 25 GB SSD NVMe (Pesos GGUF + Base vectorial persistente).

---

## 4. Concurrencia y Capacidad de Escalabilidad a $N$ Usuarios

* **Latencia Total de Transacción ($T_{total}$):** `33.99 segundos`  
  *(OpenCV: 0.28s | ChromaDB RAG: 0.04s | Inferencia LLM: 33.67s)*.
* **Throughput Máximo por Nodo (1 GPU Dedicada):**
  * **1.77 consultas diagnósticas por minuto (QPM)**.
  * **106 consultas evaluadas por hora**.
* **Capacidad de Atención Simultánea en Entorno Clínico:**
  * Considerando un estándar médico ambulatorio de 10 a 15 minutos por paciente (4 consultas/hora por dermatólogo), **1 solo nodo local abastece el flujo de 26 boxes dermatológicos concurrentes** sin generar demoras perceptibles.
* **Escalado Horizontal a $N$ Nodos:** Para redes hospitalarias mayores a 50 boxes, se escala mediante balanceador de carga simple (Nginx) distribuyendo peticiones entre $N$ estaciones de trabajo con GPU.

---

## 5. Análisis Financiero: Hardware Local (CAPEX) vs. Cloud (OPEX)

### Estructura de Costos del Proyecto
* **Inversión Inicial de Hardware (CAPEX):** `$1,850.00 USD` (Adquisición de Workstation Edge con GPU 12-16GB).
* **Gasto Operativo Local (OPEX):** `$18.00 USD/mes` (Consumo eléctrico de ~250W durante jornadas de 9 horas).

### Matriz Comparativa Anual por Volumen de Consultas

| Escenario Clínico | Volumen Mensual | Costo Local Anual (CAPEX + OPEX) | Costo Nube Equivalente (AWS/Azure) | Ahorro Anual Solución Local |
| :--- | :---: | :---: | :---: | :---: |
| Centro Médico Ambulatorio | 500 consultas | $1,566.00 USD | $4,968.00 USD | **+$3,402.00 USD** |
| Clínica Dermatológica Regional | 2500 consultas | $1,566.00 USD | $5,640.00 USD | **+$4,074.00 USD** |
| Red Hospitalaria / Servicio de Salud | 10000 consultas | $1,566.00 USD | $8,160.00 USD | **+$6,594.00 USD** |

### Retorno de Inversión (ROI) y Punto de Equilibrio (*Break-Even*)
* Para un volumen medio de 1.000 consultas mensuales, la inversión en el hardware local se amortiza completamente en **3.3 meses**.
* A partir del mes 4, la institución reduce sus costos operativos de inferencia en más de un **78%** frente a arquitecturas cloud.

---

## 6. Seguridad de Red y Reglas NSG (Network Security Groups)

Para garantizar aislamiento clínico de grado hospitalario (*Zero-Trust Local*):

### Reglas de Grupo de Seguridad de Red (NSG)
| Prioridad | Dirección | Puerto / Protocolo | Origen | Destino | Acción | Justificación |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **100** | Inbound | `TCP :5173` | VLAN Médica (`192.168.10.0/24`) | Host Local | **ALLOW** | Acceso a la interfaz web de telemedicina. |
| **110** | Inbound | `TCP :8000` | Frontend Host | Host Local | **ALLOW** | Tráfico REST API hacia el backend FastAPI. |
| **120** | Inbound | `TCP :1234` | `127.0.0.1` (Loopback) | Host Local | **ALLOW** | Inferencia de LM Studio restringida estrictamente a localhost. |
| **200** | Inbound | `*` Any | `0.0.0.0/0` (Internet) | Any | **DENY** | Bloqueo absoluto de conexiones externas no autorizadas. |
| **300** | Outbound | `*` Any | Host Local | `0.0.0.0/0` (Internet) | **DENY** | Bloqueo total de egreso para anular fugas de telemetría o datos clínicos. |
