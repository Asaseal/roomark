import type { RoomMesh } from "./furnish";

export type InspectionStatus = "normal" | "attention" | "risk";

export type InspectionItem = {
  label: string;
  status: InspectionStatus;
  note: string;
};

export type PropertyProfile = {
  monthlyRent: string;
  deposit: string;
  oneTimeFees: string;
  totalMoveInCost: string;
  commuteMinutes: number;
  commuteTime: string;
  area: string;
  recommendationTag: string;
  furnitureFit: string;
  compareLabel: string;
  decisionSummary: string;
  riskSummary: string;
  highRiskCount: number;
  pendingCount: number;
  inspection: InspectionItem[];
};

export type PropertyRecord = PropertyProfile & {
  id: string;
  title: string;
  roomMesh: RoomMesh;
  latitude: number;
  longitude: number;
  hasVisited: boolean;
  hasScan: boolean;
  isFavorite: boolean;
  hasFurnishLayout?: boolean;
  renderStatus?: "none" | "mock-ready" | "saved" | "failed";
  renderUpdatedAt?: string;
};
