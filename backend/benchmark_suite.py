import asyncio
import time
import httpx
import argparse
import os
from rag import populate_initial_guidelines, query_clinical_guidelines

LM_STUDIO_URL = "http://127.0.0.1:1234/v1/chat/completions"
SYSTEM_PROMPT = "Eres un asistente clínico experto en dermatología cuantitativa."

# Casos de prueba controlados para evaluación estandarizada
BENCHMARK_CASES = [
    {
        "id": "CASO_1_EXPANSION",
        "descripcion": "Crecimiento tumoral acelerado (>20%) con pérdida de circularidad",
        "metrics": {
            "control_1_area": 4200.0,
            "control_2_area": 5600.0,
            "delta_area_percent": 33.33,
            "control_1_circularity": 0.81,
            "control_2_circularity": 0.62,
            "delta_circularity": -0.19
        }
    },
    {
        "id": "CASO_2_REGRESION",
        "descripcion": "Resolución / Regresión marcada de lesión (-100%)",
        "metrics": {
            "control_1_area": 3150.0,
            "control_2_area": 0.0,
            "delta_area_percent": -100.0,
            "control_1_circularity": 0.77,
            "control_2_circularity": 0.0,
            "delta_circularity": -0.77
        }
    },
    {
        "id": "CASO_3_ESTABILIDAD",
        "descripcion": "Nevo melanocítico quiescente con variaciones mínimas (+1.8%)",
        "metrics": {
            "control_1_area": 2800.0,
            "control_2_area": 2850.0,
            "delta_area_percent": 1.79,
            "control_1_circularity": 0.84,
            "control_2_circularity": 0.83,
            "delta_circularity": -0.01
        }
    }
]

async def execute_test(model_name: str, case: dict, with_rag: bool):
    metrics = case["metrics"]
    
    # 1. Recuperación RAG si corresponde
    retrieved_context = ""
    if with_rag:
        query = (
            f"Lesión con cambio de área {metrics['delta_area_percent']}% "
            f"y variación de circularidad {metrics['delta_circularity']}"
        )
        retrieved_context = query_clinical_guidelines(query, n_results=2)

    # 2. Construcción del Prompt
    rag_section = f"\n### Literatura Clínica Recuperada (RAG):\n{retrieved_context}\n" if with_rag else ""
    prompt = f"""Analiza la evolución entre dos controles fotográficos dermatológicos.

### Métricas Cuantitativas:
- Variación de Área: {metrics['delta_area_percent']}% (Control 1: {metrics['control_1_area']} px -> Control 2: {metrics['control_2_area']} px)
- Variación de Circularidad: {metrics['delta_circularity']} (Control 1: {metrics['control_1_circularity']} -> Control 2: {metrics['control_2_circularity']})
{rag_section}
Instrucciones:
1. Concluye técnicamente la evolución morfométrica.
2. Emite una recomendación de conducta médica según las guías clínicas disponibles.
"""

    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1000
    }

    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(LM_STUDIO_URL, json=payload)
            res.raise_for_status()
            t_total = time.time() - t0
            data = res.json()

            usage = data.get("usage", {})
            tokens_prompt = usage.get("prompt_tokens", 0)
            tokens_gen = usage.get("completion_tokens", 0)
            speed = round(tokens_gen / t_total, 2) if t_total > 0 else 0.0

            choice = data["choices"][0]["message"]
            content = choice.get("content") or choice.get("reasoning_content") or ""

            return {
                "ok": True,
                "model": model_name,
                "case_id": case["id"],
                "rag": "CON RAG" if with_rag else "SIN RAG",
                "total_time": round(t_total, 2),
                "prompt_tokens": tokens_prompt,
                "gen_tokens": tokens_gen,
                "speed_tps": speed,
                "output_sample": content.strip().replace("\n", " ")[:200] + "...",
                "full_output": content
            }
    except Exception as e:
        return {
            "ok": False,
            "model": model_name,
            "case_id": case["id"],
            "rag": "CON RAG" if with_rag else "SIN RAG",
            "error": str(e)
        }

async def run_suite(model_name: str):
    populate_initial_guidelines()
    print(f"\n=======================================================")
    print(f"   EJECUTANDO BENCHMARK PARA MODELO: {model_name}")
    print(f"=======================================================\n")

    results = []
    for case in BENCHMARK_CASES:
        print(f"Evaluando {case['id']}...")
        
        # Test 1: SIN RAG
        print("  -> Ejecutando SIN RAG...")
        res_no_rag = await execute_test(model_name, case, with_rag=False)
        results.append(res_no_rag)

        # Test 2: CON RAG
        print("  -> Ejecutando CON RAG...")
        res_rag = await execute_test(model_name, case, with_rag=True)
        results.append(res_rag)

    # Exportar a Markdown
    out_file = f"../docs/benchmark_{model_name.replace(' ', '_').lower()}.md"
    os.makedirs("../docs", exist_ok=True)

    with open(out_file, "w", encoding="utf-8") as f:
        f.write(f"# Telemetría de Benchmark: {model_name}\n\n")
        f.write("| Caso de Prueba | Condición | Tiempo Total (s) | Tokens Generados | Velocidad (tokens/s) |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        for r in results:
            if r.get("ok"):
                f.write(f"| {r['case_id']} | {r['rag']} | {r['total_time']}s | {r['gen_tokens']} | **{r['speed_tps']} t/s** |\n")
            else:
                f.write(f"| {r['case_id']} | {r['rag']} | ERROR | - | - |\n")

        f.write("\n\n## Detalle de Diagnósticos Generados\n\n")
        for r in results:
            if r.get("ok"):
                f.write(f"### [{r['rag']}] {r['case_id']}\n")
                f.write(f"**Latencia:** {r['total_time']}s | **Velocidad:** {r['speed_tps']} t/s\n\n")
                f.write(f"{r['full_output']}\n\n---\n\n")

    print(f"\nResultados guardados con éxito en: {out_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, required=True, help="Nombre del modelo que está corriendo en LM Studio")
    args = parser.parse_args()

    asyncio.run(run_suite(args.model))