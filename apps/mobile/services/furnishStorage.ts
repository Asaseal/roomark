import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FurnishProject, RoomMesh } from "../types/furnish";

const storagePrefix = "roomark:furnish-project:";

function isFurnishProject(value: unknown): value is FurnishProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<FurnishProject>;
  return (
    typeof project.id === "string" &&
    typeof project.roomId === "string" &&
    Boolean(project.roomMesh) &&
    Array.isArray(project.placedFurniture) &&
    typeof project.updatedAt === "string"
  );
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

export async function loadFurnishProject(roomMesh: RoomMesh): Promise<FurnishProject> {
  const stored = await AsyncStorage.getItem(`${storagePrefix}${roomMesh.id}`);

  if (!stored) {
    return createEmptyFurnishProject(roomMesh);
  }

  try {
    const project = JSON.parse(stored) as unknown;
    if (!isFurnishProject(project)) {
      return createEmptyFurnishProject(roomMesh);
    }
    return {
      ...project,
      roomMesh: {
        ...roomMesh,
        ...project.roomMesh
      }
    };
  } catch {
    return createEmptyFurnishProject(roomMesh);
  }
}

export async function saveFurnishProject(project: FurnishProject): Promise<void> {
  const nextProject: FurnishProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    syncState: "local"
  };

  await AsyncStorage.setItem(`${storagePrefix}${project.roomId}`, JSON.stringify(nextProject));
}

export async function clearFurnishProject(roomId: string): Promise<void> {
  await AsyncStorage.removeItem(`${storagePrefix}${roomId}`);
}

export async function queueFurnishProjectSync(project: FurnishProject): Promise<void> {
  await saveFurnishProject({
    ...project,
    syncState: "pending"
  });
}
