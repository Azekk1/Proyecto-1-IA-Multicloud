import cv2
import numpy as np
import base64
from typing import Tuple, Dict, Any, Optional

def process_lesion_image(
    image_bytes: bytes,
    roi_box: Optional[Dict[str, float]] = None
) -> Tuple[Dict[str, Any], str]:
    """
    Segmentación dermatológica local asistida por ROI:
    - Aísla la región recortada para que el vello exterior (cejas) no contamine el análisis.
    - Muestra la piel sana periférica del propio recuadro como referencia basal.
    - Extrae el contorno exacto de la lesión mediante desviación cromática Delta E.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar el archivo de imagen.")

    h, w, _ = img.shape
    annotated = img.copy()

    # 1. Caso: Remisión completa o usuario indicó que no hay lesión
    if not roi_box or roi_box.get("w", 0) <= 0.01 or roi_box.get("h", 0) <= 0.01:
        cv2.putText(
            annotated,
            "Sin lesion registrada (0 px)",
            (30, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 180, 0),
            2,
            cv2.LINE_AA
        )
        _, buffer = cv2.imencode(".jpg", annotated)
        b64_img = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"
        return {"area": 0.0, "circularity": 0.0}, b64_img

    # 2. Conversión de coordenadas relativas a píxeles absolutos
    rx = int(roi_box["x"] * w)
    ry = int(roi_box["y"] * h)
    rw = int(roi_box["w"] * w)
    rh = int(roi_box["h"] * h)

    # Asegurar límites dentro de la imagen
    rx = max(0, min(rx, w - 5))
    ry = max(0, min(ry, h - 5))
    rw = max(5, min(rw, w - rx))
    rh = max(5, min(rh, h - ry))

    # 3. RECORTE AISLADO (La ceja y sombras exteriores quedan 100% fuera)
    crop = img[ry:ry+rh, rx:rx+rw]
    crop_h, crop_w, _ = crop.shape

    # Suavizado para eliminar textura de poros dentro del recorte
    crop_smooth = cv2.GaussianBlur(crop, (5, 5), 0)
    crop_lab = cv2.cvtColor(crop_smooth, cv2.COLOR_BGR2LAB).astype(np.float32)

    # 4. Muestreo de la piel sana local (el marco perimetral del recuadro)
    b_thickness = max(2, int(min(crop_h, crop_w) * 0.10))
    border_pixels = np.concatenate([
        crop_lab[:b_thickness, :, :].reshape(-1, 3),
        crop_lab[-b_thickness:, :, :].reshape(-1, 3),
        crop_lab[:, :b_thickness, :].reshape(-1, 3),
        crop_lab[:, -b_thickness:, :].reshape(-1, 3)
    ], axis=0)

    local_skin_median = np.median(border_pixels, axis=0)

    # 5. Distancia cromática Delta E de cada píxel respecto a su piel circundante
    delta_e = np.linalg.norm(crop_lab - local_skin_median, axis=2)

    # Si la variación de color en el recuadro es ínfima, es piel homogénea (sin lesión)
    max_contrast = np.percentile(delta_e, 95)
    selected_area = 0.0
    circularity = 0.0

    if max_contrast >= 8.0:
        # Binarización Otsu sobre la diferencia cromática
        norm_diff = cv2.normalize(delta_e, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        _, thresh = cv2.threshold(norm_diff, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Cierre morfológico para rellenar el interior del nódulo
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

        # Suprimir bordes extremos del recorte para que no se pegue al marco
        thresh[:2, :] = 0
        thresh[-2:, :] = 0
        thresh[:, :2] = 0
        thresh[:, -2:] = 0

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if contours:
            # Tomar la masa principal detectada dentro del recuadro
            main_cnt = max(contours, key=cv2.contourArea)
            area = float(cv2.contourArea(main_cnt))

            if area >= 30.0:
                selected_area = area
                perimeter = cv2.arcLength(main_cnt, True)
                circularity = (4 * np.pi * selected_area) / (perimeter ** 2) if perimeter > 0 else 0.0

                # PROYECCIÓN: Trasladar coordenadas locales del crop a la imagen completa
                global_cnt = main_cnt.copy()
                global_cnt[:, :, 0] += rx
                global_cnt[:, :, 1] += ry

                # Dibujar contorno verde y recuadro azul en la imagen final
                cv2.drawContours(annotated, [global_cnt], -1, (0, 255, 0), 2)
                cv2.rectangle(annotated, (rx, ry), (rx + rw, ry + rh), (255, 120, 0), 2)
                cv2.putText(
                    annotated,
                    f"Area: {int(selected_area)} px | Circ: {round(circularity, 2)}",
                    (rx, max(25, ry - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 120, 0),
                    2,
                    cv2.LINE_AA
                )

    if selected_area == 0.0:
        cv2.rectangle(annotated, (rx, ry), (rx + rw, ry + rh), (0, 180, 0), 1)
        cv2.putText(
            annotated,
            "Sin lesion detectada en ROI (0 px)",
            (rx, max(25, ry - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 180, 0),
            2,
            cv2.LINE_AA
        )

    _, buffer = cv2.imencode(".jpg", annotated)
    b64_img = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

    return {
        "area": round(selected_area, 2),
        "circularity": round(circularity, 3)
    }, b64_img


def calculate_differential_metrics(metrics_1: Dict[str, Any], metrics_2: Dict[str, Any]) -> Dict[str, Any]:
    a1 = metrics_1["area"]
    a2 = metrics_2["area"]
    c1 = metrics_1["circularity"]
    c2 = metrics_2["circularity"]

    if a1 > 0:
        delta_area_percent = round(((a2 - a1) / a1) * 100.0, 2)
    else:
        delta_area_percent = 0.0 if a2 == 0 else 100.0

    delta_circ = round(c2 - c1, 3)

    return {
        "control_1_area": a1,
        "control_2_area": a2,
        "delta_area_percent": delta_area_percent,
        "control_1_circularity": c1,
        "control_2_circularity": c2,
        "delta_circularity": delta_circ
    }