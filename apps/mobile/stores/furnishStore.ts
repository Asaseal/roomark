import { create } from "zustand";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import { loadFurnishProject, saveFurnishProject } from "../services/furnishStorage";

type FurnishState = {
  projectsByRoomId: Record<string, FurnishProject>;
  recoveryWarningsByRoomId: Partial<Record<string, string>>;
  activeProject?: FurnishProject;
  loading: boolean;
  saveError?: string;
  pendingSave: boolean;
  loadProject: (roomMesh: RoomMesh) => Promise<FurnishProject>;
  setActiveProject: (project: FurnishProject) => void;
  saveProject: (project: FurnishProject) => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  hasProjectFurniture: (roomId: string) => boolean;
};

let furnishPersistenceQueue = Promise.resolve();
let pendingSaveCount = 0;

function enqueueFurnishPersistence(operation: () => Promise<void>): Promise<void> {
  const queuedWrite = furnishPersistenceQueue.then(operation, operation);
  furnishPersistenceQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}

export const useFurnishStore = create<FurnishState>((set, get) => ({
  projectsByRoomId: {},
  recoveryWarningsByRoomId: {},
  activeProject: undefined,
  loading: false,
  saveError: undefined,
  pendingSave: false,
  async loadProject(roomMesh) {
    set({ loading: true });
    const result = await loadFurnishProject(roomMesh);
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
        recoveryWarningsByRoomId: nextWarnings,
        activeProject: project,
        loading: false
      };
    });

    return project;
  },
  setActiveProject(project) {
    set((state) => ({
      activeProject: project,
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
      activeProject: nextProject,
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
  async retrySave() {
    const project = get().activeProject;
    if (!project) {
      return false;
    }
    return get().saveProject(project);
  },
  hasProjectFurniture(roomId) {
    return (get().projectsByRoomId[roomId]?.placedFurniture.length ?? 0) > 0;
  }
}));
