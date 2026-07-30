import { create } from "zustand";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import { loadFurnishProject, saveFurnishProject } from "../services/furnishStorage";

type FurnishState = {
  projectsByRoomId: Record<string, FurnishProject>;
  loadingRoomIds: Partial<Record<string, true>>;
  recoveryWarningsByRoomId: Partial<Record<string, string>>;
  saveErrorsByRoomId: Partial<Record<string, string>>;
  pendingSaveRoomIds: Partial<Record<string, true>>;
  loadProject: (roomMesh: RoomMesh) => Promise<FurnishProject>;
  setProject: (project: FurnishProject) => void;
  saveProject: (project: FurnishProject) => Promise<boolean>;
  retrySave: (roomId: string) => Promise<boolean>;
  hasProjectFurniture: (roomId: string) => boolean;
};

let furnishPersistenceQueue = Promise.resolve();
const furnishProjectLoads = new Map<string, Promise<FurnishProject>>();
const pendingSaveCountsByRoomId = new Map<string, number>();

function incrementPendingSaveCount(roomId: string): number {
  const nextCount = (pendingSaveCountsByRoomId.get(roomId) ?? 0) + 1;
  pendingSaveCountsByRoomId.set(roomId, nextCount);
  return nextCount;
}

function decrementPendingSaveCount(roomId: string): number {
  const nextCount = Math.max(
    0,
    (pendingSaveCountsByRoomId.get(roomId) ?? 1) - 1
  );

  if (nextCount > 0) {
    pendingSaveCountsByRoomId.set(roomId, nextCount);
  } else {
    pendingSaveCountsByRoomId.delete(roomId);
  }

  return nextCount;
}

function enqueueFurnishPersistence(operation: () => Promise<void>): Promise<void> {
  const queuedWrite = furnishPersistenceQueue.then(operation, operation);
  furnishPersistenceQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}

export const useFurnishStore = create<FurnishState>((set, get) => ({
  projectsByRoomId: {},
  loadingRoomIds: {},
  recoveryWarningsByRoomId: {},
  saveErrorsByRoomId: {},
  pendingSaveRoomIds: {},
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

    incrementPendingSaveCount(nextProject.roomId);
    set((state) => ({
      pendingSaveRoomIds: {
        ...state.pendingSaveRoomIds,
        [nextProject.roomId]: true
      }
    }));
    try {
      await enqueueFurnishPersistence(() => saveFurnishProject(nextProject));
      set((state) => {
        const nextWarnings = { ...state.recoveryWarningsByRoomId };
        const nextSaveErrors = { ...state.saveErrorsByRoomId };
        delete nextWarnings[nextProject.roomId];
        delete nextSaveErrors[nextProject.roomId];
        return {
          recoveryWarningsByRoomId: nextWarnings,
          saveErrorsByRoomId: nextSaveErrors
        };
      });
      return true;
    } catch {
      set((state) => ({
        saveErrorsByRoomId: {
          ...state.saveErrorsByRoomId,
          [nextProject.roomId]: "软装布局尚未写入设备，请重试。"
        }
      }));
      return false;
    } finally {
      const remainingCount = decrementPendingSaveCount(nextProject.roomId);
      set((state) => {
        const nextPendingRoomIds = { ...state.pendingSaveRoomIds };

        if (remainingCount > 0) {
          nextPendingRoomIds[nextProject.roomId] = true;
        } else {
          delete nextPendingRoomIds[nextProject.roomId];
        }

        return {
          pendingSaveRoomIds: nextPendingRoomIds
        };
      });
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
