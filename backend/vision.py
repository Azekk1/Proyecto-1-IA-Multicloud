import cv2
import numpy as np
import base64
from typing import Tuple, Dict, Any

def process_lesion_image(image_bytes: bytes) -> Tuple[Dict[str, float], str]:
    """
    Procesa una imagen dérmica en bytes:
    1. Decodifica la imagen.
    2. Aplica desenfoque y umbralización adaptativa (Otsu) para segmentar la lesión.
    3. Detecta el contorno principal.
    4. Calcula métricas: Área y Circularidad (Isoperimétrica).
    5. Dibuja el contorno sobre la imagen y la retorna en formato Base64.
    """
    # 1. Convertir bytes a imagen OpenCV (numpy array)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("No se pudo decodificar la imagen.")

    # Redimensionar manteniendo aspecto para consistencia de cálculo
    target_width = 500
    h, w = img.shape[:2]
    aspect_ratio = h / w
    img_resized = cv2.resize(img, (target_width, int(target_width * aspect_ratio)))

    # 2. Preprocesamiento: Escala de grises y desenfoque Gaussiano
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # 3. Segmentación: Umbralización de Otsu invertida
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Operación morfológica de cierre para eliminar ruido interno/pelo superficial
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    # 4. Encontrar contornos
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return {"area": 0.0, "perimeter": 0.0, "circularity": 0.0}, ""

    # Tomar el contorno de mayor área (la lesión principal)
    main_contour = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(main_contour))
    perimeter = float(cv2.arcLength(main_contour, True))

    # Circularidad = (4 * pi * Area) / (Perímetro ^ 2) -> Valor entre 0 (irregular) y 1 (círculo perfecto)
    circularity = 0.0
    if perimeter > 0:
        circularity = float((4 * np.pi * area) / (perimeter ** 2))

    # 5. Dibujar contorno verde y cuadro delimitador sobre la imagen
    annotated_img = img_resized.copy()
    cv2.drawContours(annotated_img, [main_contour], -1, (0, 255, 0), 2)
    
    x, y, bw, bh = cv2.boundingRect(main_contour)
    cv2.rectangle(annotated_img, (x, y), (x + bw, y + bh), (255, 0, 0), 1)

    # 6. Codificar imagen resultante en PNG Base64 para el frontend
    _, buffer = cv2.imencode('.png', annotated_img)
    b64_image = f"data:image/png;base64,{base64.b64encode(buffer).decode('utf-8')}"

    metrics = {
        "area": round(area, 2),
        "perimeter": round(perimeter, 2),
        "circularity": round(circularity, 4)
    }

    return metrics, b64_image

def calculate_differential_metrics(metrics_1: Dict[str, float], metrics_2: Dict[str, float]) -> Dict[str, float]:
    """
    Calcula la variación porcentual de área y cambio en circularidad entre dos controles.
    """
    area1 = metrics_1.get("area", 0.0)
    area2 = metrics_2.get("area", 0.0)
    
    # Delta % área
    delta_area_percent = 0.0
    if area1 > 0:
        delta_area_percent = round(((area2 - area1) / area1) * 100.0, 2)

    # Delta circularidad
    circ1 = metrics_1.get("circularity", 0.0)
    circ2 = metrics_2.get("circularity", 0.0)
    delta_circularity = round(circ2 - circ1, 4)

    return {
        "delta_area_percent": delta_area_percent,
        "delta_circularity": delta_circularity,
        "control_1_area": area1,
        "control_2_area": area2,
        "control_1_circularity": circ1,
        "control_2_circularity": circ2
    }