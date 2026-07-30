import AsyncStorage from "@react-native-async-storage/async-storage";
import { propertyCatalog } from "../data/propertyCatalog";
import type { ProductState } from "../types/productState";
import {
  createInitialProductStateFromCatalog,
  recoverProductState,
  type ProductStateLoadResult
} from "./productStateRecovery";

const productStorageKey = "roomark:mobile:product-state:v1";
const MAX_PRODUCT_STATE_LENGTH = 2_000_000;

export type { ProductStateLoadResult } from "./productStateRecovery";

export function createInitialProductState(): ProductState {
  return createInitialProductStateFromCatalog(propertyCatalog);
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

    if (storedValue.length > MAX_PRODUCT_STATE_LENGTH) {
      return recoverProductState(undefined, propertyCatalog);
    }

    return recoverProductState(JSON.parse(storedValue) as unknown, propertyCatalog);
  } catch {
    return recoverProductState(undefined, propertyCatalog);
  }
}

export async function saveProductState(state: ProductState): Promise<void> {
  await AsyncStorage.setItem(productStorageKey, JSON.stringify(state));
}
