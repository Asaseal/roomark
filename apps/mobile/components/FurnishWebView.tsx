import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeSyntheticEvent } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import {
  isAllowedFurnishNavigation,
  parseFurnishSceneMessage
} from "../services/furnishSceneBridge";
import type { FurnishNativeMessage, FurnishProject, FurnitureAsset } from "../types/furnish";
import { getFurnishSceneHtml } from "../webview/furnish-scene/sceneHtml";

export type FurnishWebViewHandle = {
  sendMessage: (message: FurnishNativeMessage) => void;
};

type FurnishWebViewProps = {
  project: FurnishProject;
  assets: FurnitureAsset[];
  onProjectChanged: (project: FurnishProject) => void;
  onSceneReady: () => void;
  onSceneReadyChanged: (ready: boolean) => void;
  onSceneError: (message: string) => void;
  onSceneNotice: (message: string) => void;
  onFurnitureSelected: (furnitureId: string | null) => void;
  onExit: () => void;
};

const furnitureModelModules: Record<string, number> = {
  "D-glb/sofa.glb": require("../assets/D-glb/sofa.glb"),
  "D-glb/table.glb": require("../assets/D-glb/table.glb"),
  "D-glb/chair.glb": require("../assets/D-glb/chair.glb"),
  "D-glb/bed.glb": require("../assets/D-glb/bed.glb"),
  "D-glb/storage.glb": require("../assets/D-glb/storage.glb")
};
const furnishRuntimeModule = require("../assets/vendor/furnish-runtime.js.txt");

const GLB_DATA_URI_PREFIX = "data:model/gltf-binary;base64,";
const SCENE_LOAD_TIMEOUT_MS = 45000;

type WebViewRenderProcessGoneEvent = NativeSyntheticEvent<{
  didCrash: boolean;
}>;

function FurnishWebViewInner(
  {
    project,
    assets,
    onProjectChanged,
    onSceneReady,
    onSceneReadyChanged,
    onSceneError,
    onSceneNotice,
    onFurnitureSelected,
    onExit
  }: FurnishWebViewProps,
  ref: Ref<FurnishWebViewHandle>
) {
  const webViewRef = useRef<WebView>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assetResolutionReady, setAssetResolutionReady] = useState(false);
  const [resolvedModelUris, setResolvedModelUris] = useState<Record<string, string>>({});
  const [sceneHtml, setSceneHtml] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initSentRef = useRef(false);
  const automaticRecoveryAttemptedRef = useRef(false);
  const invalidSceneMessageNoticedRef = useRef(false);

  const resolvedAssets = useMemo(
    () =>
      assets.map((asset) => ({
        ...asset,
        modelUri: resolvedModelUris[asset.modelUri] ?? asset.modelUri,
        sourceModelUri: asset.sourceModelUri ?? asset.modelUri
      })),
    [assets, resolvedModelUris]
  );

  const resolvedAssetById = useMemo(
    () =>
      resolvedAssets.reduce<Record<string, FurnitureAsset>>((assetMap, asset) => {
        assetMap[asset.id] = asset;
        return assetMap;
      }, {}),
    [resolvedAssets]
  );

  const sendMessage = useCallback(
    (message: FurnishNativeMessage) => {
      const outgoingMessage =
        message.type === "ADD_FURNITURE"
          ? {
              ...message,
              asset: resolvedAssetById[message.asset.id] ?? message.asset
            }
          : message;
      webViewRef.current?.postMessage(JSON.stringify(outgoingMessage));
    },
    [resolvedAssetById]
  );

  useImperativeHandle(ref, () => ({ sendMessage }));

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setSceneReady(false);
    onSceneReadyChanged(false);
    setLoadError(null);
    initSentRef.current = false;
    clearLoadTimeout();

    if (!sceneHtml) {
      return;
    }

    loadTimeoutRef.current = setTimeout(() => {
      setLoadError("3D 场景加载较慢，请点击重试");
      onSceneReadyChanged(false);
      onSceneError("3D 场景加载较慢，可点击重试");
    }, SCENE_LOAD_TIMEOUT_MS);

    return clearLoadTimeout;
  }, [clearLoadTimeout, onSceneError, onSceneReadyChanged, sceneHtml, webViewKey]);

  useEffect(() => {
    let mounted = true;

    async function loadFurnishRuntime() {
      try {
        setSceneHtml(null);
        const [runtimeAsset] = await Asset.loadAsync(furnishRuntimeModule);
        const readableRuntimeUri = runtimeAsset.localUri ?? runtimeAsset.uri;

        if (!readableRuntimeUri) {
          throw new Error("Bundled 3D runtime URI is unavailable");
        }

        const runtimeSource = await FileSystem.readAsStringAsync(readableRuntimeUri);

        if (mounted) {
          setSceneHtml(getFurnishSceneHtml(runtimeSource));
        }
      } catch {
        if (mounted) {
          const message = "本地 3D 运行时读取失败，请点击重试";
          clearLoadTimeout();
          setLoadError(message);
          setSceneReady(false);
          onSceneReadyChanged(false);
          onSceneError(message);
        }
      }
    }

    void loadFurnishRuntime();

    return () => {
      mounted = false;
    };
  }, [clearLoadTimeout, onSceneError, onSceneReadyChanged, webViewKey]);

  useEffect(() => {
    let mounted = true;

    async function resolveModelAssets() {
      const entries = await Promise.all(
        Object.entries(furnitureModelModules).map(async ([modelUri, moduleId]) => {
          try {
            const [modelAsset] = await Asset.loadAsync(moduleId);
            const readableUri = modelAsset.localUri ?? modelAsset.uri;

            if (!readableUri) {
              return [modelUri, modelUri] as const;
            }

            try {
              const base64Model = await FileSystem.readAsStringAsync(readableUri, {
                encoding: FileSystem.EncodingType.Base64
              });
              return [modelUri, `${GLB_DATA_URI_PREFIX}${base64Model}`] as const;
            } catch {
              onSceneNotice(`${modelUri} 已解析为本地文件 URI，若真机无法读取会自动使用占位模型`);
              return [modelUri, readableUri] as const;
            }
          } catch {
            onSceneNotice(`${modelUri} 资源准备失败，将使用占位模型`);
            return [modelUri, modelUri] as const;
          }
        })
      );

      if (mounted) {
        setResolvedModelUris(Object.fromEntries(entries));
        setAssetResolutionReady(true);
      }
    }

    void resolveModelAssets();

    return () => {
      mounted = false;
    };
  }, [onSceneNotice]);

  useEffect(() => {
    if (!sceneReady || !assetResolutionReady || initSentRef.current) {
      return;
    }

    initSentRef.current = true;
    sendMessage({
      type: "INIT_PROJECT",
      project,
      assets: resolvedAssets
    });
  }, [assetResolutionReady, project, resolvedAssets, sceneReady, sendMessage]);

  const restartScene = useCallback(() => {
    clearLoadTimeout();
    setLoadError(null);
    setSceneReady(false);
    setSceneHtml(null);
    initSentRef.current = false;
    invalidSceneMessageNoticedRef.current = false;
    onSceneReadyChanged(false);
    setWebViewKey((value) => value + 1);
  }, [clearLoadTimeout, onSceneReadyChanged]);

  const retryScene = () => {
    automaticRecoveryAttemptedRef.current = false;
    restartScene();
  };

  const handleRenderProcessGone = useCallback(
    (event: WebViewRenderProcessGoneEvent) => {
      clearLoadTimeout();
      setSceneReady(false);
      onSceneReadyChanged(false);

      if (!automaticRecoveryAttemptedRef.current) {
        automaticRecoveryAttemptedRef.current = true;
        onSceneNotice(
          event.nativeEvent.didCrash
            ? "3D 场景意外退出，正在恢复"
            : "3D 场景被系统回收，正在恢复"
        );
        restartScene();
        return;
      }

      const message = "3D 场景连续恢复失败，请重试或返回房源详情";
      setLoadError(message);
      onSceneError(message);
    },
    [clearLoadTimeout, onSceneError, onSceneNotice, onSceneReadyChanged, restartScene]
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    const result = parseFurnishSceneMessage(event.nativeEvent.data, project);

    if (!result.ok) {
      if (!invalidSceneMessageNoticedRef.current) {
        invalidSceneMessageNoticedRef.current = true;
        onSceneNotice("已忽略异常的 3D 场景消息，当前布局未保存");
      }
      return;
    }

    const message = result.message;
    if (message.type === "SCENE_READY") {
      clearLoadTimeout();
      automaticRecoveryAttemptedRef.current = false;
      setSceneReady(true);
      onSceneReadyChanged(true);
      setLoadError(null);
      onSceneReady();
    }

    if (message.type === "PROJECT_CHANGED") {
      onProjectChanged(message.project);
    }

    if (message.type === "FURNITURE_SELECTED") {
      onFurnitureSelected(message.furnitureId);
    }

    if (message.type === "SCENE_ERROR") {
      clearLoadTimeout();
      setLoadError(message.message);
      setSceneReady(false);
      onSceneReadyChanged(false);
      onSceneError(message.message);
    }

    if (message.type === "SCENE_NOTICE") {
      onSceneNotice(message.message);
    }
  };

  return (
    <View style={styles.container}>
      {sceneHtml ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          originWhitelist={["about:blank", "data:text/html*"]}
          source={{ html: sceneHtml, baseUrl: "" }}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) =>
            isAllowedFurnishNavigation(request.url)
          }
          onMessage={handleMessage}
          onRenderProcessGone={handleRenderProcessGone}
          onError={() => {
            setLoadError("WebView 加载失败，请点击重试");
            setSceneReady(false);
            onSceneReadyChanged(false);
            onSceneError("WebView 加载失败，请点击重试");
          }}
          style={styles.webView}
        />
      ) : null}
      {!sceneReady ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            {loadError ? null : <ActivityIndicator color="#2f2a22" />}
            <Text style={styles.loadingTitle}>{loadError ? "3D 场景暂未打开" : "正在搭建 3D 房间"}</Text>
            <Text style={styles.loadingText}>{loadError ?? "正在从应用内加载 3D 运行时"}</Text>
            {loadError ? (
              <View style={styles.errorActions}>
                <TouchableOpacity accessibilityRole="button" style={styles.retryButton} activeOpacity={0.86} onPress={retryScene}>
                  <Text style={styles.retryButtonText}>重试加载</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={styles.exitButton} activeOpacity={0.86} onPress={onExit}>
                  <Text style={styles.exitButtonText}>返回房源详情</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const FurnishWebView = forwardRef(FurnishWebViewInner);

export default FurnishWebView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden"
  },
  webView: {
    backgroundColor: "#efe5d7",
    flex: 1
  },
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(239, 229, 215, 0.94)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  loadingCard: {
    alignItems: "center",
    backgroundColor: "#fffaf2",
    borderColor: "#e1d4c0",
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 280,
    padding: 22
  },
  loadingTitle: {
    color: "#2f2a22",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12
  },
  loadingText: {
    color: "#6d6257",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center"
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#2f2a22",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 46,
    paddingHorizontal: 18
  },
  errorActions: {
    alignSelf: "stretch",
    gap: 8,
    marginTop: 16
  },
  exitButton: {
    alignItems: "center",
    borderColor: "#cdbca6",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 18
  },
  exitButtonText: {
    color: "#51483e",
    fontSize: 14,
    fontWeight: "900"
  },
  retryButtonText: {
    color: "#fff8ef",
    fontSize: 14,
    fontWeight: "900"
  }
});
