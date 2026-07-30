import type {
  FurnishProject,
  FurnishSceneMessage,
  PlacedFurniture
} from "../types/furnish";
import { recoverFurnishProject } from "./furnishProjectRecovery";

export const MAX_FURNISH_SCENE_MESSAGE_LENGTH = 256_000;
export const MAX_FURNISH_SCENE_FURNITURE = 256;

const MAX_FURNISH_SCENE_TEXT_LENGTH = 240;
const MAX_FURNITURE_ID_LENGTH = 128;

export type FurnishSceneMessageParseResult =
  | { ok: true; message: FurnishSceneMessage }
  | {
      ok: false;
      reason: "too-large" | "invalid-json" | "invalid-message";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function equalVector(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((component, index) => component === right[index])
  );
}

function sameVisualFurniture(
  left: PlacedFurniture,
  right: PlacedFurniture
) {
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.category === right.category &&
    left.modelUri === right.modelUri &&
    equalVector(left.position, right.position) &&
    equalVector(left.rotation, right.rotation) &&
    equalVector(left.scale, right.scale)
  );
}

function sameVisualLayout(
  left: PlacedFurniture[],
  right: PlacedFurniture[]
) {
  return (
    left.length === right.length &&
    left.every((furniture, index) =>
      sameVisualFurniture(furniture, right[index])
    )
  );
}

function parseChangedProject(
  value: unknown,
  currentProject: FurnishProject
): FurnishSceneMessageParseResult {
  if (
    !isRecord(value) ||
    value.id !== currentProject.id ||
    value.roomId !== currentProject.roomId ||
    !Array.isArray(value.placedFurniture) ||
    value.placedFurniture.length > MAX_FURNISH_SCENE_FURNITURE
  ) {
    return { ok: false, reason: "invalid-message" };
  }

  const recovered = recoverFurnishProject(
    value,
    currentProject.roomMesh
  ).project;

  if (
    recovered.id !== currentProject.id ||
    recovered.placedFurniture.length !== value.placedFurniture.length
  ) {
    return { ok: false, reason: "invalid-message" };
  }

  const visualLayoutUnchanged = sameVisualLayout(
    currentProject.placedFurniture,
    recovered.placedFurniture
  );
  const renderPreview = visualLayoutUnchanged
    ? recovered.renderPreview ?? currentProject.renderPreview
    : undefined;
  const project: FurnishProject = {
    ...recovered,
    syncState: "local",
    ...(renderPreview ? { renderPreview } : { renderPreview: undefined })
  };

  return {
    ok: true,
    message: { type: "PROJECT_CHANGED", project }
  };
}

export function parseFurnishSceneMessage(
  raw: string,
  currentProject: FurnishProject
): FurnishSceneMessageParseResult {
  if (raw.length > MAX_FURNISH_SCENE_MESSAGE_LENGTH) {
    return { ok: false, reason: "too-large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    return { ok: false, reason: "invalid-message" };
  }

  if (value.type === "SCENE_READY") {
    return { ok: true, message: { type: "SCENE_READY" } };
  }

  if (value.type === "PROJECT_CHANGED") {
    return parseChangedProject(value.project, currentProject);
  }

  if (
    value.type === "FURNITURE_SELECTED" &&
    (value.furnitureId === null ||
      isBoundedText(value.furnitureId, MAX_FURNITURE_ID_LENGTH))
  ) {
    return {
      ok: true,
      message: {
        type: "FURNITURE_SELECTED",
        furnitureId: value.furnitureId
      }
    };
  }

  if (
    (value.type === "SCENE_ERROR" || value.type === "SCENE_NOTICE") &&
    isBoundedText(value.message, MAX_FURNISH_SCENE_TEXT_LENGTH)
  ) {
    return {
      ok: true,
      message: { type: value.type, message: value.message }
    };
  }

  return { ok: false, reason: "invalid-message" };
}

export function isAllowedFurnishNavigation(url: string) {
  return url === "about:blank" || url.startsWith("data:text/html");
}
