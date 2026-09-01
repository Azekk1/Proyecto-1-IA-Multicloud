export interface DermatologyMetrics {
  delta_area_percent: number;
  delta_circularity: number;
  control_1_area: number;
  control_2_area: number;
  control_1_circularity: number;
  control_2_circularity: number;
}

export interface DermatologyAnalysisResponse {
  control_1_image: string;
  control_2_image: string;
  metrics: DermatologyMetrics;
  retrieved_guidelines: string;
  clinical_report: string;
}