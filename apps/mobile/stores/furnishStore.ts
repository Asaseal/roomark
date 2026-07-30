import { create } from "zustand";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import { loadFurnishProject, saveFurnishProject } from "../services/furnishStorage";

type FurnishState = {
  projectsByRoomId: Record<string, FurnishProject>;
  loadingRoomIds: Partial<Record<string, true>>;
  recoveryWarningsByRoomId: Partial<Record<string, string>>;
  saveError?: string;
  pendingSave: boolean;
  loadProject: (roomMesh: RoomMesh) => Promise<FurnishProject>;
  setProject: (project: FurnishProject) => void;
  saveProject: (project: FurnishProject) => Promise<boolean>;
  retrySave: (roomId: string) => Promise<boolean>;
  hasProjectFurniture: (roomId: string) => boolean;
};

let furnishPersistenceQueue = Promise.resolve();
const furnishProjectLoads = new Map<string, Promise<FurnishProject>>();
let pendingSaveCount = 0;

function enqueueFurnishPersistence(operation: () => Promise<void>): Promise<void> {
  const queuedWrite = furnishPersistenceQueue.then(operation, operation);
  furnishPersistenceQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}

export const useFurnishStore = create<FurnishState>((set, get) => ({
  projectsByRoomId: {},
  loadingRoomIds: {},
  recoveryWarningsByRoomId: {},
  saveError: undefined,
  pendingSave: false,
  loadProject(roomMesh) {
    const existingLoad = furnishProjectLoads.get(roomMesh.id);
    if (existingLoad) {
      return existingLoad;
    }

    set((state) => ({
      loadingRoomIds: {
        ...state.loadingRoomIds,
        [roomMesh.id]: true
      }
    }));

    const projectLoad = loadFurnishProject(roomMesh).then((result) => {
      const project = result.project;
      set((state) => {
        const nextWarnings = { ...state.recoveryWarningsByRoomId };
        if (result.warning) {
          nextWarnings[roomMesh.id] = result.warning;
        } else {
          delete nextWarnings[roomMesh.id];
        }

        return {
          projectsByRoomId: {
            ...state.projectsByRoomId,
            [roomMesh.id]: project
          },
          recoveryWarningsByRoomId: nextWarnings
        };
      });
      return project;
    }).finally(() => {
      furnishProjectLoads.delete(roomMesh.id);
      set((state) => {
        const nextLoadingRoomIds = { ...state.loadingRoomIds };
        delete nextLoadingRoomIds[roomMesh.id];
        return {
          loadingRoomIds: nextLoadingRoomIds
        };
      });
    });

    furnishProjectLoads.set(roomMesh.id, projectLoad);
    return projectLoad;
  },
  setProject(project) {
    set((state) => ({
      projectsByRoomId: {
        ...state.projectsByRoomId,
        [project.roomId]: project
      }
    }));
  },
  async saveProject(project) {
    const nextProject: FurnishProject = {
      ...project,
      updatedAt: new Date().toISOString(),
      syncState: "local"
    };

    set((state) => ({
      projectsByRoomId: {
        ...state.projectsByRoomId,
        [nextProject.roomId]: nextProject
      }
    }));

    pendingSaveCount += 1;
    set({ pendingSave: true });
    try {
      await enqueueFurnishPersistence(() => saveFurnishProject(nextProject));
      set((state) => {
        const nextWarnings = { ...state.recoveryWarningsByRoomId };
        delete nextWarnings[nextProject.roomId];
        return {
          recoveryWarningsByRoomId: nextWarnings,
          saveError: undefined
        };
      });
      return true;
    } catch {
      set({ saveError: "软装布局尚未写入设备，请重试。" });
      return false;
    } finally {
      pendingSaveCount = Math.max(0, pendingSaveCount - 1);
      set({ pendingSave: pendingSaveCount > 0 });
    }
  },
  async retrySave(roomId) {
    const project = get().projectsByRoomId[roomId];
    if (!project) {
      return false;
    }
    return get().saveProject(project);
  },
  hasProjectFurniture(roomId) {
    return (get().projectsByRoomId[roomId]?.placedFurniture.length ?? 0) > 0;
  }
}));
