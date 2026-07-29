import type { RoomMesh } from "../types/furnish";
import type { PropertyRecord } from "../types/property";
import type { FloorPlanFallbackInput, SimulatedScanInput } from "../types/scan";

function assertPositiveDimensions(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("尺寸必须大于 0");
  }
}

export function simulateRoomScan(input: SimulatedScanInput): RoomMesh {
  assertPositiveDimensions(input.width, input.depth, input.height);

  return {
    id: input.id,
    name: input.name,
    source: "mock",
    width: input.width,
    depth: input.depth,
    height: input.height,
    capturedAt: input.capturedAt ?? new Date().toISOString()
  };
}

export function createFloorPlanFallback(input: FloorPlanFallbackInput): RoomMesh {
  assertPositiveDimensions(input.aspectRatio, input.height);
  const depth = 3.6;

  return {
    id: input.id,
    name: input.name,
    source: "floorplan",
    width: Number((depth * input.aspectRatio).toFixed(2)),
    depth,
    height: input.height,
    capturedAt: input.capturedAt ?? new Date().toISOString()
  };
}

export function createScannedProperty(roomMesh: RoomMesh): PropertyRecord {
  return {
    id: roomMesh.id,
    title: roomMesh.name,
    roomMesh,
    monthlyRent: "待补充",
    deposit: "待补充",
    oneTimeFees: "待补充",
    totalMoveInCost: "待补充",
    commuteMinutes: 0,
    commuteTime: "待补充",
    area: `${(roomMesh.width * roomMesh.depth).toFixed(1)}㎡`,
    latitude: 31.2304,
    longitude: 121.4737,
    hasVisited: true,
    hasScan: true,
    isFavorite: false,
    recommendationTag: "待完成现场记录",
    furnitureFit: "待模拟",
    compareLabel: "扫描已保存，成本、通勤和风险仍需补充。",
    decisionSummary: "房型尺寸已经保存，可继续记录风险或进入模拟软装。",
    riskSummary: "0 项待确认 / 0 项高风险",
    highRiskCount: 0,
    pendingCount: 0,
    inspection: []
  };
}
