import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { getFurnishSceneHtml } from "../webview/furnish-scene/sceneHtml";

const GLB_DATA_URI_PREFIX = "data:model/gltf-binary;base64,";
const runtimeHtmlPromises = new Map<number, Promise<string>>();
const modelResolutionPromises = new Map<string, Promise<ModelResolution>>();

type ModelResolution = {
  uri: string;
  notice?: string;
  cacheable: boolean;
};

export type FurnishModelResolution = {
  uris: Record<string, string>;
  notices: string[];
};

function cacheSuccessfulPromise<Key, Value>(
  cache: Map<Key, Promise<Value>>,
  key: Key,
  loader: () => Promise<Value>
): Promise<Value> {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const loading = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (cache.get(key) === loading) {
        cache.delete(key);
      }
      throw error;
    });
  cache.set(key, loading);
  return loading;
}

export function loadFurnishSceneHtml(runtimeModule: number): Promise<string> {
  return cacheSuccessfulPromise(runtimeHtmlPromises, runtimeModule, async () => {
    const [runtimeAsset] = await Asset.loadAsync(runtimeModule);
    const readableRuntimeUri = runtimeAsset.localUri ?? runtimeAsset.uri;
    if (!readableRuntimeUri) {
      throw new Error("Bundled 3D runtime URI is unavailable");
    }

    const runtimeSource = await FileSystem.readAsStringAsync(readableRuntimeUri);
    return getFurnishSceneHtml(runtimeSource);
  });
}

async function resolveFurnishModelUri(
  modelUri: string,
  moduleId: number
): Promise<ModelResolution> {
  const key = `${modelUri}:${moduleId}`;
  const existing = modelResolutionPromises.get(key);
  if (existing) {
    return existing;
  }

  const loading = (async (): Promise<ModelResolution> => {
    let readableUri: string | undefined;
    try {
      const [modelAsset] = await Asset.loadAsync(moduleId);
      readableUri = modelAsset.localUri ?? modelAsset.uri;
      if (!readableUri) {
        throw new Error("Bundled model URI is unavailable");
      }

      const base64Model = await FileSystem.readAsStringAsync(readableUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      return {
        uri: `${GLB_DATA_URI_PREFIX}${base64Model}`,
        cacheable: true
      };
    } catch {
      return readableUri
        ? {
            uri: readableUri,
            notice: `${modelUri} 已解析为本地文件 URI，若真机无法读取会自动使用占位模型`,
            cacheable: false
          }
        : {
            uri: modelUri,
            notice: `${modelUri} 资源准备失败，将使用占位模型`,
            cacheable: false
          };
    }
  })();

  modelResolutionPromises.set(key, loading);
  const resolution = await loading;
  if (!resolution.cacheable && modelResolutionPromises.get(key) === loading) {
    modelResolutionPromises.delete(key);
  }
  return resolution;
}

export async function resolveFurnishModelUris(
  modelModules: Record<string, number>
): Promise<FurnishModelResolution> {
  const entries = await Promise.all(
    Object.entries(modelModules).map(async ([modelUri, moduleId]) => {
      const resolution = await resolveFurnishModelUri(modelUri, moduleId);
      return [modelUri, resolution] as const;
    })
  );

  return {
    uris: Object.fromEntries(
      entries.map(([modelUri, resolution]) => [modelUri, resolution.uri])
    ),
    notices: entries.flatMap(([, resolution]) =>
      resolution.notice ? [resolution.notice] : []
    )
  };
}
