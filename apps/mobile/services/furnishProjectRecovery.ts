import type {
  FurnishProject,
  FurnitureCategory,
  PlacedFurniture,
  RenderPreview,
  RoomMesh,
  Vector3Tuple
} from "../types/furnish";

export type FurnishProjectLoadResult = {
  project: FurnishProject;
  recovered: boolean;
  warning?: string;
};

const emptyRecoveryWarning = "软装记录无法读取，已恢复空白布局。";
const partialRecoveryWarning = "部分软装记录已损坏，已保留可恢复的布局。";
const furnitureCategories: FurnitureCategory[] = ["sofa", "table", "chair", "bed", "storage"];
const renderStatuses: RenderPreview["status"][] = ["mock-ready", "saved", "failed"];
const syncStates: FurnishProject["syncState"][] = ["local", "pending", "synced", "failed"];
const roomSources: RoomMesh["source"][] = ["mock", "roomplan", "lidar", "floorplan"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVector3(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => isFiniteNumber(component))
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundPosition(value: number) {
  return Number(value.toFixed(3));
}

function isFurnitureCategory(value: unknown): value is FurnitureCategory {
  return furnitureCategories.some((category) => category === value);
}

function isRoomSource(value: unknown): value is RoomMesh["source"] {
  return roomSources.some((source) => source === value);
}

function isRenderStatus(value: unknown): value is RenderPreview["status"] {
  return renderStatuses.some((status) => status === value);
}

function isSyncState(value: unknown): value is FurnishProject["syncState"] {
  return syncStates.some((state) => state === value);
}

function storedRoomMatchesCurrent(value: unknown, roomMesh: RoomMesh) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.id === roomMesh.id &&
    value.name === roomMesh.name &&
    isRoomSource(value.source) &&
    value.source === roomMesh.source &&
    value.width === roomMesh.width &&
    value.depth === roomMesh.depth &&
    value.height === roomMesh.height &&
    value.capturedAt === roomMesh.capturedAt
  );
}

function recoverPlacedFurniture(
  value: unknown,
  roomMesh: RoomMesh,
  seenIds: Set<string>
): { furniture: PlacedFurniture; changed: boolean } | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    seenIds.has(value.id) ||
    !isNonEmptyString(value.assetId) ||
    !isFurnitureCategory(value.category) ||
    !isNonEmptyString(value.modelUri) ||
    !isVector3(value.position) ||
    !isVector3(value.rotation) ||
    !isVector3(value.scale) ||
    !value.scale.every((component) => component > 0 && component <= 10) ||
    typeof value.locked !== "boolean" ||
    !isTimestamp(value.createdAt)
  ) {
    return null;
  }

  const xLimit = Math.max(0, roomMesh.width / 2 - 0.15);
  const zLimit = Math.max(0, roomMesh.depth / 2 - 0.15);
  const position: Vector3Tuple = [
    roundPosition(clamp(value.position[0], -xLimit, xLimit)),
    0,
    roundPosition(clamp(value.position[2], -zLimit, zLimit))
  ];
  const changed =
    position[0] !== value.position[0] ||
    position[1] !== value.position[1] ||
    position[2] !== value.position[2];

  seenIds.add(value.id);

  return {
    furniture: {
      id: value.id,
      assetId: value.assetId,
      category: value.category,
      modelUri: value.modelUri,
      position,
      rotation: [...value.rotation],
      scale: [...value.scale],
      locked: value.locked,
      createdAt: value.createdAt
    },
    changed
  };
}

function recoverRenderPreview(
  value: unknown,
  roomMesh: RoomMesh,
  furnitureCount: number
): RenderPreview | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    value.roomId !== roomMesh.id ||
    !isRenderStatus(value.status) ||
    !isNonEmptyString(value.renderPrompt) ||
    !isRecord(value.basis) ||
    !isNonEmptyString(value.basis.roomSize) ||
    !Number.isInteger(value.basis.furnitureCount) ||
    !isFiniteNumber(value.basis.furnitureCount) ||
    value.basis.furnitureCount < 0 ||
    value.basis.furnitureCount !== furnitureCount ||
    !isNonEmptyString(value.basis.style) ||
    !isNonEmptyString(value.basis.layoutSummary) ||
    !isNonEmptyString(value.summary) ||
    !isNonEmptyString(value.style) ||
    !isTimestamp(value.createdAt) ||
    (value.savedAt !== undefined && !isTimestamp(value.savedAt))
  ) {
    return null;
  }

  return {
    id: value.id,
    roomId: value.roomId,
    status: value.status,
    renderPrompt: value.renderPrompt,
    basis: {
      roomSize: value.basis.roomSize,
      furnitureCount: value.basis.furnitureCount,
      style: value.basis.style,
      layoutSummary: value.basis.layoutSummary
    },
    summary: value.summary,
    style: value.style,
    createdAt: value.createdAt,
    ...(value.savedAt ? { savedAt: value.savedAt } : {})
  };
}

export function createEmptyFurnishProject(roomMesh: RoomMesh): FurnishProject {
  const now = new Date().toISOString();

  return {
    id: `furnish-${roomMesh.id}`,
    roomId: roomMesh.id,
    roomMesh,
    placedFurniture: [],
    updatedAt: now,
    syncState: "local"
  };
}

export function recoverFurnishProject(
  value: unknown,
  roomMesh: RoomMesh
): FurnishProjectLoadResult {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    value.roomId !== roomMesh.id ||
    !Array.isArray(value.placedFurniture) ||
    !isTimestamp(value.updatedAt)
  ) {
    return {
      project: createEmptyFurnishProject(roomMesh),
      recovered: true,
      warning: emptyRecoveryWarning
    };
  }

  const seenIds = new Set<string>();
  const placedFurniture: PlacedFurniture[] = [];
  let furnitureChanged = false;

  for (const candidate of value.placedFurniture) {
    const recoveredFurniture = recoverPlacedFurniture(candidate, roomMesh, seenIds);
    if (!recoveredFurniture) {
      furnitureChanged = true;
      continue;
    }

    placedFurniture.push(recoveredFurniture.furniture);
    furnitureChanged ||= recoveredFurniture.changed;
  }

  const roomChanged = !storedRoomMatchesCurrent(value.roomMesh, roomMesh);
  const syncState = isSyncState(value.syncState) ? value.syncState : "local";
  const syncChanged = syncState !== value.syncState;
  let renderPreview: RenderPreview | undefined;
  let previewChanged = false;

  if (value.renderPreview !== undefined) {
    const recoveredPreview = recoverRenderPreview(
      value.renderPreview,
      roomMesh,
      placedFurniture.length
    );
    if (recoveredPreview && !roomChanged && !furnitureChanged) {
      renderPreview = recoveredPreview;
    } else {
      previewChanged = true;
    }
  }

  const recovered = roomChanged || furnitureChanged || previewChanged || syncChanged;

  return {
    project: {
      id: value.id,
      roomId: roomMesh.id,
      roomMesh,
      placedFurniture,
      ...(renderPreview ? { renderPreview } : {}),
      updatedAt: value.updatedAt,
      syncState
    },
    recovered,
    ...(recovered ? { warning: partialRecoveryWarning } : {})
  };
}
