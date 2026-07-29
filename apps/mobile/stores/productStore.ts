import { create } from "zustand";
import { createInitialProductState, loadProductState, saveProductState } from "../services/productStorage";
import type { ProductState } from "../types/productState";
import type { PropertyRecord } from "../types/property";

type ProductStore = ProductState & {
  hydrated: boolean;
  hydrationError?: string;
  persistenceError?: string;
  pendingPersistence: boolean;
  hydrate: () => Promise<void>;
  selectProperty: (propertyId?: string) => Promise<void>;
  upsertProperty: (property: PropertyRecord) => Promise<boolean>;
  toggleComparison: (propertyId: string) => Promise<void>;
  saveScanResult: (property: PropertyRecord) => Promise<boolean>;
  updateProjectStatus: (propertyId: string, furnitureCount: number, renderStatus: PropertyRecord["renderStatus"], renderUpdatedAt?: string) => Promise<void>;
  retryPersistence: () => Promise<void>;
  dismissPersistenceError: () => void;
};

function selectProductState(state: ProductState): ProductState {
  return {
    schemaVersion: state.schemaVersion,
    propertiesById: state.propertiesById,
    comparisonIds: state.comparisonIds,
    selectedPropertyId: state.selectedPropertyId,
    updatedAt: state.updatedAt
  };
}

function withUpdatedAt(state: ProductState): ProductState {
  return {
    ...selectProductState(state),
    updatedAt: new Date().toISOString()
  };
}

const initialState = createInitialProductState();
let persistenceQueue = Promise.resolve();
let pendingPersistenceCount = 0;

function enqueuePersistence(operation: () => Promise<void>): Promise<void> {
  const queuedWrite = persistenceQueue.then(operation, operation);
  persistenceQueue = queuedWrite.then(() => undefined, () => undefined);
  return queuedWrite;
}

export const useProductStore = create<ProductStore>((set, get) => {
  async function persistStateSafely(state: ProductState): Promise<boolean> {
    pendingPersistenceCount += 1;
    set({ pendingPersistence: true });
    try {
      await enqueuePersistence(() => saveProductState(selectProductState(state)));
      set({ persistenceError: undefined });
      return true;
    } catch {
      set({ persistenceError: "本次修改尚未写入设备，请重试。" });
      return false;
    } finally {
      pendingPersistenceCount = Math.max(0, pendingPersistenceCount - 1);
      set({ pendingPersistence: pendingPersistenceCount > 0 });
    }
  }

  return {
    ...initialState,
    hydrated: false,
    hydrationError: undefined,
    persistenceError: undefined,
    pendingPersistence: false,
    async hydrate() {
      try {
        const loadResult = await loadProductState();
        set({
          ...loadResult.state,
          hydrated: true,
          hydrationError: loadResult.message
        });
      } catch {
        set({
          ...createInitialProductState(),
          hydrated: true,
          hydrationError: "本地记录读取失败，已使用设备内置房源。"
        });
      }
    },
    async selectProperty(propertyId) {
      const nextState = withUpdatedAt({
        ...selectProductState(get()),
        selectedPropertyId: propertyId
      });
      set(nextState);
      await persistStateSafely(nextState);
    },
    async upsertProperty(property) {
      const nextState = withUpdatedAt({
        ...selectProductState(get()),
        propertiesById: {
          ...get().propertiesById,
          [property.id]: property
        }
      });
      set(nextState);
      return persistStateSafely(nextState);
    },
    async toggleComparison(propertyId) {
      const currentIds = get().comparisonIds;
      const comparisonIds = currentIds.includes(propertyId)
        ? currentIds.filter((id) => id !== propertyId)
        : [...currentIds, propertyId];
      const nextState = withUpdatedAt({
        ...selectProductState(get()),
        comparisonIds
      });
      set(nextState);
      await persistStateSafely(nextState);
    },
    async saveScanResult(property) {
      return get().upsertProperty(property);
    },
    async updateProjectStatus(propertyId, furnitureCount, renderStatus, renderUpdatedAt) {
      const property = get().propertiesById[propertyId];
      if (!property) {
        return;
      }
      await get().upsertProperty({
        ...property,
        hasFurnishLayout: furnitureCount > 0,
        renderStatus,
        renderUpdatedAt
      });
    },
    async retryPersistence() {
      await persistStateSafely(selectProductState(get()));
    },
    dismissPersistenceError() {
      set({ persistenceError: undefined });
    }
  };
});
