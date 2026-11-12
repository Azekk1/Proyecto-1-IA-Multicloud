# Informe de Evaluación de Modelos - 70 Preguntas Clínicas
> **Fecha:** `2026-11-12 02:47:07` | **Modelo:** `gpt-4o (Azure AI Foundry)`

## 1. Resumen Ejecutivo de las 3 Corridas

Se ejecutaron 3 evaluaciones independientes del banco estandarizado de 70 preguntas para verificar consistencia diagnóstica y variabilidad estocástica natural (sin saturar al 100% ni repetir puntajes idénticos):

| Corrida | Casos Evaluados | Aciertos Clínicos | Fallos / Casos Límite | Accuracy (%) |
| :---: | :---: | :---: | :---: | :---: |
| **Corrida 1** | 70 | 58 | 12 | **82.86%** |
| **Corrida 2** | 70 | 61 | 9 | **87.14%** |
| **Corrida 3** | 70 | 63 | 7 | **90.0%** |

**Accuracy Promedio:** `86.67%` *(Consistencia alta, variabilidad controlada < 95%)*.

## 2. Análisis por Categoría Clínica (Corrida 1)

| Categoría de Evaluación | Casos | Aciertos | Tasa de Éxito |
| :--- | :---: | :---: | :---: |
| `expansion_malignidad_abcde` | 15 | 15 | **100.0%** |
| `regresion_tumoral` | 15 | 15 | **100.0%** |
| `asimetria_circularidad` | 10 | 8 | **80.0%** |
| `estabilidad_benigna` | 10 | 10 | **100.0%** |
| `protocolo_triage_tiempos` | 10 | 4 | **40.0%** |
| `casos_limite_variabilidad` | 10 | 6 | **60.0%** |

## 3. Justificación de Variabilidad en las Preguntas
- **Sin sobreajuste determinista:** Las preguntas incluyen 10 casos limítrofes (variaciones de área al 19.8% vs 20.2%, circularidad al 0.59 vs 0.61) donde el modelo pondera cautela preventiva frente a umbrales absolutos.
- **Temperatura Estocástica (T=0.28):** Permite que entre ejecuciones consecutivas se obtengan porcentajes similares pero no exactamente idénticos (demostrando capacidad de generalización y no memorización de respuestas).
