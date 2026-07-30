import type { RoomMesh } from "../types/furnish";
import type { ProductState } from "../types/productState";
import type {
  InspectionItem,
  InspectionStatus,
  PropertyRecord
} from "../types/property";

export type ProductStateLoadResult = {
  state: ProductState;
  recoveredFromError: boolean;
  message?: string;
};

const fullRecoveryMessage = "本地记录无法读取，已恢复设备内置房源。";
const partialRecoveryMessage = "部分本地记录已损坏，已保留可恢复内容。";
const inspectionStatuses: InspectionStatus[] = ["normal", "attention", "risk"];
const roomSources: RoomMesh["source"][] = ["mock", "roomplan", "lidar", "floorplan"];
const renderStatuses: NonNullable<PropertyRecord["renderStatus"]>[] = [
  "none",
  "mock-ready",
  "saved",
  "failed"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum = 1_000): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function isOptionalString(value: unknown, maximum = 2_048): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maximum);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isFiniteNumber(value) && value >= 0;
}

function isInspectionStatus(value: unknown): value is InspectionStatus {
  return inspectionStatuses.some((status) => status === value);
}

function isRoomSource(value: unknown): value is RoomMesh["source"] {
  return roomSources.some((source) => source === value);
}

function isRenderStatus(
  value: unknown
): value is NonNullable<PropertyRecord["renderStatus"]> {
  return renderStatuses.some((status) => status === value);
}

function isRoomMesh(value: unknown, expectedId: string): value is RoomMesh {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.id === expectedId &&
    isBoundedString(value.name) &&
    isRoomSource(value.source) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.depth) &&
    value.depth > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0 &&
    isOptionalString(value.modelUri) &&
    isOptionalString(value.thumbnailUri) &&
    isTimestamp(value.capturedAt)
  );
}

function isInspectionItem(value: unknown): value is InspectionItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedString(value.label) &&
    isInspectionStatus(value.status) &&
    isBoundedString(value.note)
  );
}

function isPropertyRecord(value: unknown, expectedId: string): value is PropertyRecord {
  if (
    !isRecord(value) ||
    value.id !== expectedId ||
    !isBoundedString(value.id, 128) ||
    !isBoundedString(value.title) ||
    !isRoomMesh(value.roomMesh, expectedId) ||
    !isBoundedString(value.monthlyRent) ||
    !isBoundedString(value.deposit) ||
    !isBoundedString(value.oneTimeFees) ||
    !isBoundedString(value.totalMoveInCost) ||
    !isNonNegativeInteger(value.commuteMinutes) ||
    !isBoundedString(value.commuteTime) ||
    !isBoundedString(value.area) ||
    !isFiniteNumber(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    !isFiniteNumber(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180 ||
    typeof value.hasVisited !== "boolean" ||
    typeof value.hasScan !== "boolean" ||
    typeof value.isFavorite !== "boolean" ||
    !isBoundedString(value.recommendationTag) ||
    !isBoundedString(value.furnitureFit) ||
    !isBoundedString(value.compareLabel) ||
    !isBoundedString(value.decisionSummary) ||
    !isBoundedString(value.riskSummary) ||
    !isNonNegativeInteger(value.highRiskCount) ||
    !isNonNegativeInteger(value.pendingCount) ||
    !Array.isArray(value.inspection) ||
    !value.inspection.every((item) => isInspectionItem(item)) ||
    (value.hasFurnishLayout !== undefined &&
      typeof value.hasFurnishLayout !== "boolean") ||
    (value.renderStatus !== undefined && !isRenderStatus(value.renderStatus)) ||
    (value.renderUpdatedAt !== undefined && !isTimestamp(value.renderUpdatedAt))
  ) {
    return false;
  }

  const highRiskCount = value.inspection.filter(
    (item) => item.status === "risk"
  ).length;
  const pendingCount = value.inspection.filter(
    (item) => item.status === "attention"
  ).length;

  return (
    value.highRiskCount === highRiskCount &&
    value.pendingCount === pendingCount
  );
}

function copyRoomMesh(roomMesh: RoomMesh): RoomMesh {
  return {
    id: roomMesh.id,
    name: roomMesh.name,
    source: roomMesh.source,
    width: roomMesh.width,
    depth: roomMesh.depth,
    height: roomMesh.height,
    ...(roomMesh.modelUri !== undefined ? { modelUri: roomMesh.modelUri } : {}),
    ...(roomMesh.thumbnailUri !== undefined
      ? { thumbnailUri: roomMesh.thumbnailUri }
      : {}),
    capturedAt: roomMesh.capturedAt
  };
}

function copyInspectionItem(item: InspectionItem): InspectionItem {
  return {
    label: item.label,
    status: item.status,
    note: item.note
  };
}

function copyPropertyRecord(property: PropertyRecord): PropertyRecord {
  return {
    id: property.id,
    title: property.title,
    roomMesh: copyRoomMesh(property.roomMesh),
    monthlyRent: property.monthlyRent,
    deposit: property.deposit,
    oneTimeFees: property.oneTimeFees,
    totalMoveInCost: property.totalMoveInCost,
    commuteMinutes: property.commuteMinutes,
    commuteTime: property.commuteTime,
    area: property.area,
    latitude: property.latitude,
    longitude: property.longitude,
    hasVisited: property.hasVisited,
    hasScan: property.hasScan,
    isFavorite: property.isFavorite,
    ...(property.hasFurnishLayout !== undefined
      ? { hasFurnishLayout: property.hasFurnishLayout }
      : {}),
    ...(property.renderStatus !== undefined
      ? { renderStatus: property.renderStatus }
      : {}),
    ...(property.renderUpdatedAt !== undefined
      ? { renderUpdatedAt: property.renderUpdatedAt }
      : {}),
    recommendationTag: property.recommendationTag,
    furnitureFit: property.furnitureFit,
    compareLabel: property.compareLabel,
    decisionSummary: property.decisionSummary,
    riskSummary: property.riskSummary,
    highRiskCount: property.highRiskCount,
    pendingCount: property.pendingCount,
    inspection: property.inspection.map(copyInspectionItem)
  };
}

function copyCatalogById(
  catalog: PropertyRecord[]
): Record<string, PropertyRecord> {
  return Object.fromEntries(
    catalog.map((property) => [property.id, copyPropertyRecord(property)])
  );
}

function recoverCatalogProperty(
  catalogProperty: PropertyRecord,
  storedProperty: unknown
): { property: PropertyRecord; recovered: boolean } {
  const property = copyPropertyRecord(catalogProperty);
  if (storedProperty === undefined) {
    return { property, recovered: false };
  }
  if (!isRecord(storedProperty)) {
    return { property, recovered: true };
  }

  let recovered = !isPropertyRecord(storedProperty, catalogProperty.id);

  for (const field of ["hasVisited", "hasScan", "isFavorite"] as const) {
    const storedValue = storedProperty[field];
    if (typeof storedValue === "boolean") {
      property[field] = storedValue;
    } else {
      recovered = true;
    }
  }

  if (typeof storedProperty.hasFurnishLayout === "boolean") {
    property.hasFurnishLayout = storedProperty.hasFurnishLayout;
  } else if (storedProperty.hasFurnishLayout !== undefined) {
    recovered = true;
  }

  if (isRenderStatus(storedProperty.renderStatus)) {
    property.renderStatus = storedProperty.renderStatus;
  } else if (storedProperty.renderStatus !== undefined) {
    recovered = true;
  }

  if (isTimestamp(storedProperty.renderUpdatedAt)) {
    property.renderUpdatedAt = storedProperty.renderUpdatedAt;
  } else if (storedProperty.renderUpdatedAt !== undefined) {
    recovered = true;
  }

  return { property, recovered };
}

export function createInitialProductStateFromCatalog(
  catalog: PropertyRecord[],
  now = new Date().toISOString()
): ProductState {
  return {
    schemaVersion: 1,
    propertiesById: copyCatalogById(catalog),
    comparisonIds: catalog.map((property) => property.id),
    updatedAt: now
  };
}

export function recoverProductState(
  value: unknown,
  catalog: PropertyRecord[],
  now = new Date().toISOString()
): ProductStateLoadResult {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.propertiesById) ||
    !Array.isArray(value.comparisonIds)
  ) {
    return {
      state: createInitialProductStateFromCatalog(catalog, now),
      recoveredFromError: true,
      message: fullRecoveryMessage
    };
  }

  const catalogIds = new Set(catalog.map((property) => property.id));
  const propertiesById: Record<string, PropertyRecord> = {};
  let recovered = false;

  for (const catalogProperty of catalog) {
    const storedProperty = value.propertiesById[catalogProperty.id];
    const result = recoverCatalogProperty(catalogProperty, storedProperty);
    propertiesById[catalogProperty.id] = result.property;
    recovered ||= result.recovered;
  }

  for (const [propertyId, storedProperty] of Object.entries(
    value.propertiesById
  )) {
    if (catalogIds.has(propertyId)) {
      continue;
    }
    if (isPropertyRecord(storedProperty, propertyId)) {
      propertiesById[propertyId] = copyPropertyRecord(storedProperty);
    } else {
      recovered = true;
    }
  }

  const comparisonIds: string[] = [];
  const seenComparisonIds = new Set<string>();
  for (const candidate of value.comparisonIds) {
    if (
      !isBoundedString(candidate, 128) ||
      !propertiesById[candidate] ||
      seenComparisonIds.has(candidate)
    ) {
      recovered = true;
      continue;
    }
    seenComparisonIds.add(candidate);
    comparisonIds.push(candidate);
  }

  let selectedPropertyId: string | undefined;
  if (value.selectedPropertyId !== undefined) {
    if (
      isBoundedString(value.selectedPropertyId, 128) &&
      propertiesById[value.selectedPropertyId]
    ) {
      selectedPropertyId = value.selectedPropertyId;
    } else {
      recovered = true;
    }
  }

  const updatedAt = isTimestamp(value.updatedAt) ? value.updatedAt : now;
  recovered ||= updatedAt !== value.updatedAt;

  return {
    state: {
      schemaVersion: 1,
      propertiesById,
      comparisonIds,
      ...(selectedPropertyId ? { selectedPropertyId } : {}),
      updatedAt
    },
    recoveredFromError: recovered,
    ...(recovered ? { message: partialRecoveryMessage } : {})
  };
}
