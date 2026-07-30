import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import {
  createEmptyFurnishProject,
  recoverFurnishProject,
  type FurnishProjectLoadResult
} from "./furnishProjectRecovery";

const storagePrefix = "roomark:furnish-project:";

export { createEmptyFurnishProject } from "./furnishProjectRecovery";

export async function loadFurnishProject(roomMesh: RoomMesh): Promise<FurnishProjectLoadResult> {
  const stored = await AsyncStorage.getItem(`${storagePrefix}${roomMesh.id}`);

  if (!stored) {
    return {
      project: createEmptyFurnishProject(roomMesh),
      recovered: false
    };
  }

  try {
    return recoverFurnishProject(JSON.parse(stored) as unknown, roomMesh);
  } catch {
    return recoverFurnishProject(undefined, roomMesh);
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
