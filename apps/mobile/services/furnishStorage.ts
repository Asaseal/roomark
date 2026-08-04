import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import {
  createEmptyFurnishProject,
  recoverFurnishProject,
  type FurnishProjectLoadResult
} from "./furnishProjectRecovery";
import { runStorageRead } from "./storageOperation";

const storagePrefix = "roomark:furnish-project:";

export { createEmptyFurnishProject } from "./furnishProjectRecovery";

export async function loadFurnishProject(roomMesh: RoomMesh): Promise<FurnishProjectLoadResult> {
  let stored: string | null;

  try {
    stored = await runStorageRead(
      () => AsyncStorage.getItem(`${storagePrefix}${roomMesh.id}`),
      { operationName: "软装记录读取" }
    );
  } catch {
    return {
      project: createEmptyFurnishProject(roomMesh),
      recovered: false,
      readFailed: true,
      warning: "软装记录暂时无法读取，设备中的原布局尚未被覆盖。"
    };
  }

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
