export type SimulatedScanInput = {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  capturedAt?: string;
};

export type FloorPlanFallbackInput = {
  id: string;
  name: string;
  aspectRatio: number;
  height: number;
  capturedAt?: string;
};
