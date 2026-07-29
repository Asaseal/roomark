import AsyncStorage from "@react-native-async-storage/async-storage";
import { propertyCatalog } from "../data/propertyCatalog";
import type { ProductState } from "../types/productState";
import type { PropertyRecord } from "../types/property";

const productStorageKey = "roomark:mobile:product-state:v1";

export type ProductStateLoadResult = {
  state: ProductState;
  recoveredFromError: boolean;
  message?: string;
};

function catalogById(): Record<string, PropertyRecord> {
  return Object.fromEntries(propertyCatalog.map((property) => [property.id, property]));
}

export function createInitialProductState(): ProductState {
  return {
    schemaVersion: 1,
    propertiesById: catalogById(),
    comparisonIds: propertyCatalog.map((property) => property.id),
    updatedAt: new Date().toISOString()
  };
}

export function mergeProductStateWithCatalog(storedState: ProductState): ProductState {
  const mergedProperties = catalogById();

  for (const [propertyId, storedProperty] of Object.entries(storedState.propertiesById ?? {})) {
    const catalogProperty = mergedProperties[propertyId];
    mergedProperties[propertyId] = catalogProperty
      ? {
          ...catalogProperty,
          ...storedProperty,
          roomMesh: {
            ...catalogProperty.roomMesh,
            ...storedProperty.roomMesh
          }
        }
      : storedProperty;
  }

  return {
    schemaVersion: 1,
    propertiesById: mergedProperties,
    comparisonIds: (storedState.comparisonIds ?? []).filter((id) => Boolean(mergedProperties[id])),
    selectedPropertyId: mergedProperties[storedState.selectedPropertyId ?? ""] ? storedState.selectedPropertyId : undefined,
    updatedAt: storedState.updatedAt || new Date().toISOString()
  };
}

export async function loadProductState(): Promise<ProductStateLoadResult> {
  try {
    const storedValue = await AsyncStorage.getItem(productStorageKey);
    if (!storedValue) {
      return {
        state: createInitialProductState(),
        recoveredFromError: false
      };
    }

    const storedState = JSON.parse(storedValue) as ProductState;
    if (
      storedState.schemaVersion !== 1 ||
      !storedState.propertiesById ||
      typeof storedState.propertiesById !== "object" ||
      Array.isArray(storedState.propertiesById) ||
      !Array.isArray(storedState.comparisonIds)
    ) {
      return {
        state: createInitialProductState(),
        recoveredFromError: true,
        message: "本地记录无法读取，已恢复设备内置房源。"
      };
    }

    return {
      state: mergeProductStateWithCatalog(storedState),
      recoveredFromError: false
    };
  } catch {
    return {
      state: createInitialProductState(),
      recoveredFromError: true,
      message: "本地记录无法读取，已恢复设备内置房源。"
    };
  }
}

export async function saveProductState(state: ProductState): Promise<void> {
  await AsyncStorage.setItem(productStorageKey, JSON.stringify(state));
}
