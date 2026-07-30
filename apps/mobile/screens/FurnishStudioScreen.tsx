import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import FurnitureDrawer from "../components/FurnitureDrawer";
import FurnishWebView, { FurnishWebViewHandle } from "../components/FurnishWebView";
import { createMockRenderPreview } from "../services/renderPreview";
import { useFurnishStore } from "../stores/furnishStore";
import type { FurnishProject, FurnitureAsset, RenderPreview, RoomMesh } from "../types/furnish";
import { furnitureAssets } from "../webview/furnish-scene/furnitureRegistry";

type FurnishStudioScreenProps = {
  roomMesh: RoomMesh;
  onBack: () => void;
  onProjectStatusChanged: (project: FurnishProject) => void;
};

function formatRoomSize(roomMesh: RoomMesh) {
  return `${roomMesh.width}m × ${roomMesh.depth}m × ${roomMesh.height}m`;
}

const renderStepMessages = ["正在分析家具布局", "正在生成概念光照与材质", "正在输出 Mock 效果图"];

export default function FurnishStudioScreen({ roomMesh, onBack, onProjectStatusChanged }: FurnishStudioScreenProps) {
  const webViewRef = useRef<FurnishWebViewHandle>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderStepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProjectRef = useRef<FurnishProject | null>(null);
  const exitingRef = useRef(false);
  const loadProject = useFurnishStore((state) => state.loadProject);
  const saveProject = useFurnishStore((state) => state.saveProject);
  const retrySave = useFurnishStore((state) => state.retrySave);
  const setProject = useFurnishStore((state) => state.setProject);
  const project = useFurnishStore((state) => state.projectsByRoomId[roomMesh.id]);
  const loading = useFurnishStore((state) => state.loadingRoomIds[roomMesh.id] ?? false);
  const saveError = useFurnishStore(
    (state) => state.saveErrorsByRoomId[roomMesh.id]
  );
  const pendingSave = useFurnishStore(
    (state) => state.pendingSaveRoomIds[roomMesh.id] ?? false
  );
  const recoveryWarning = useFurnishStore(
    (state) => state.recoveryWarningsByRoomId[roomMesh.id]
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [renderModalVisible, setRenderModalVisible] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderStepIndex, setRenderStepIndex] = useState(0);
  const [draftRender, setDraftRender] = useState<RenderPreview | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [statusText, setStatusText] = useState("正在准备 3D 房间");
  const [saveText, setSaveText] = useState("等待场景加载");
  const [selectedText, setSelectedText] = useState("未选中家具");

  useEffect(() => {
    void loadProject(roomMesh);
  }, [loadProject, roomMesh]);

  useEffect(
    () => () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }

      if (renderStepTimerRef.current) {
        clearInterval(renderStepTimerRef.current);
      }
      if (projectSaveTimerRef.current) {
        clearTimeout(projectSaveTimerRef.current);
      }
      if (pendingProjectRef.current) {
        const pendingProject = pendingProjectRef.current;
        void saveProject(pendingProject).then((persisted) => {
          if (persisted) {
            onProjectStatusChanged(pendingProject);
          }
        });
      }
    },
    [onProjectStatusChanged, saveProject]
  );

  const flushProjectSave = useCallback(async () => {
    if (projectSaveTimerRef.current) {
      clearTimeout(projectSaveTimerRef.current);
      projectSaveTimerRef.current = null;
    }
    const pendingProject = pendingProjectRef.current;
    if (!pendingProject) {
      return true;
    }

    pendingProjectRef.current = null;
    setSaveText("正在保存…");
    const persisted = await saveProject(pendingProject);
    if (!persisted) {
      pendingProjectRef.current = pendingProject;
      setSaveText("保存失败，请重试");
      return false;
    }

    onProjectStatusChanged(pendingProject);
    setSaveText(`已保存 · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    return true;
  }, [onProjectStatusChanged, saveProject]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && pendingProjectRef.current) {
        void flushProjectSave();
      }
    });

    return () => subscription.remove();
  }, [flushProjectSave]);

  const handleSelectAsset = (asset: FurnitureAsset) => {
    if (!sceneReady) {
      return;
    }
    setDrawerOpen(false);
    setSelectedText(`已选中：${asset.name}`);
    setStatusText("拖动家具到地面，松手后自动保存");
    webViewRef.current?.sendMessage({
      type: "ADD_FURNITURE",
      asset
    });
  };

  const handleProjectChanged = useCallback(
    (project: FurnishProject) => {
      const furnitureCount = project.placedFurniture.length;
      setStatusText(furnitureCount > 0 ? `已摆放 ${furnitureCount} 件家具` : "房间已清空");
      setSaveText("等待保存");
      setProject(project);
      pendingProjectRef.current = project;
      if (projectSaveTimerRef.current) {
        clearTimeout(projectSaveTimerRef.current);
      }
      projectSaveTimerRef.current = setTimeout(() => {
        void flushProjectSave();
      }, 350);
    },
    [flushProjectSave, setProject]
  );

  const handleRetrySave = async () => {
    if (pendingProjectRef.current) {
      await flushProjectSave();
      return;
    }

    setSaveText("正在保存…");
    const persisted = await retrySave(roomMesh.id);
    if (!persisted) {
      setSaveText("保存失败，请重试");
      return;
    }

    if (project) {
      onProjectStatusChanged(project);
    }
    setSaveText(
      `已保存 · ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );
  };

  const handleBack = useCallback(async () => {
    if (exitingRef.current) {
      return;
    }

    exitingRef.current = true;
    setDrawerOpen(false);
    if (!pendingProjectRef.current && project) {
      pendingProjectRef.current = project;
    }
    const persisted = await flushProjectSave();
    if (persisted) {
      onBack();
      return;
    }
    exitingRef.current = false;
  }, [flushProjectSave, onBack, project]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      void handleBack();
      return true;
    });

    return () => subscription.remove();
  }, [handleBack]);

  const handleGenerateRender = () => {
    if (!project || !sceneReady) {
      return;
    }

    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }

    if (renderStepTimerRef.current) {
      clearInterval(renderStepTimerRef.current);
    }

    setDrawerOpen(false);
    setDraftRender(null);
    setRenderModalVisible(true);
    setRenderLoading(true);
    setRenderStepIndex(0);
    setStatusText("正在生成 Mock 效果图预览");

    renderStepTimerRef.current = setInterval(() => {
      setRenderStepIndex((current) => Math.min(current + 1, renderStepMessages.length - 1));
    }, 430);

    const nextRender = createMockRenderPreview(project);
    renderTimerRef.current = setTimeout(() => {
      if (renderStepTimerRef.current) {
        clearInterval(renderStepTimerRef.current);
        renderStepTimerRef.current = null;
      }

      setDraftRender(nextRender);
      setRenderLoading(false);
      setStatusText("Mock 效果图预览已生成");
      renderTimerRef.current = null;
    }, 1200);
  };

  const handleSaveRender = async () => {
    if (!project || !draftRender) {
      return;
    }

    const savedRender: RenderPreview = {
      ...draftRender,
      status: "saved",
      savedAt: new Date().toISOString()
    };

    const projectWithRender = {
      ...project,
      renderPreview: savedRender
    };
    setSaveText("正在保存…");
    const persisted = await saveProject(projectWithRender);
    if (!persisted) {
      pendingProjectRef.current = projectWithRender;
      setSaveText("保存失败，请重试");
      setStatusText("Mock 效果图尚未写入设备，请重试保存");
      return;
    }
    onProjectStatusChanged(projectWithRender);
    setSaveText("Mock 效果图已保存到 Library");
    setStatusText("Mock 效果图已保存，可返回 Library 查看状态");
    setRenderModalVisible(false);
  };

  const handleCloseRender = () => {
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }

    if (renderStepTimerRef.current) {
      clearInterval(renderStepTimerRef.current);
      renderStepTimerRef.current = null;
    }

    setRenderLoading(false);
    setRenderModalVisible(false);
  };

  if (loading || !project) {
    return (
      <SafeAreaView style={styles.loadingPage}>
        <ActivityIndicator color="#2f2a22" />
        <Text style={styles.loadingText}>正在打开 Roomark 软装模拟器</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <FurnishWebView
          ref={webViewRef}
          project={project}
          assets={furnitureAssets}
          onProjectChanged={handleProjectChanged}
          onSceneReady={() => {
            setStatusText("选择家具开始模拟摆放");
            setSaveText(project.placedFurniture.length > 0 ? "已恢复上次软装布局" : `${formatRoomSize(roomMesh)} 本地样例房间`);
          }}
          onSceneReadyChanged={setSceneReady}
          onSceneError={setStatusText}
          onSceneNotice={setStatusText}
          onExit={() => void handleBack()}
          onFurnitureSelected={(furnitureId) => {
            setSelectedText(furnitureId ? "已选中家具，可固定或删除" : "未选中家具");
          }}
        />

        <FurnitureDrawer open={drawerOpen && sceneReady} onSelectAsset={handleSelectAsset} />
        <RenderPreviewModal
          visible={renderModalVisible}
          loading={renderLoading}
          stepIndex={renderStepIndex}
          preview={draftRender}
          onClose={handleCloseRender}
          onSave={handleSaveRender}
        />

        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityLabel="保存软装布局并返回房源库"
            accessibilityRole="button"
            style={styles.iconButton}
            activeOpacity={0.86}
            onPress={handleBack}
          >
            <Text style={styles.iconButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>Roomark Soft Furnish Studio</Text>
            <Text style={styles.title}>{roomMesh.name}</Text>
            <Text style={styles.roomSize}>{formatRoomSize(roomMesh)}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel={drawerOpen ? "关闭家具列表" : "打开家具列表"}
            accessibilityRole="button"
            accessibilityState={{ disabled: !sceneReady }}
            disabled={!sceneReady}
            style={[styles.iconButton, drawerOpen ? styles.iconButtonActive : null, !sceneReady ? styles.actionDisabled : null]}
            activeOpacity={0.86}
            onPress={() => setDrawerOpen((value) => !value)}
          >
            <Text style={[styles.menuIcon, drawerOpen ? styles.menuIconActive : null]}>{drawerOpen ? "×" : "☰"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusStack}>
          {recoveryWarning ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.recoveryNotice}
            >
              <Text style={styles.recoveryNoticeText}>{recoveryWarning}</Text>
            </View>
          ) : null}
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
          <View style={styles.savePill}>
            <View style={styles.saveDot} />
            <Text style={styles.savePillText}>{saveText}</Text>
          </View>
          {saveError ? (
            <TouchableOpacity
              accessibilityLabel={pendingSave ? "正在重试保存软装布局" : "重试保存软装布局"}
              accessibilityRole="button"
              accessibilityState={{ disabled: pendingSave }}
              disabled={pendingSave}
              style={[styles.retrySaveButton, pendingSave ? styles.retrySaveButtonDisabled : null]}
              onPress={() => void handleRetrySave()}
            >
              <Text style={styles.retrySaveButtonText}>{pendingSave ? "正在保存…" : "重试保存"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.selectionPill}>
          <Text style={styles.selectionText}>{selectedText}</Text>
        </View>

        <View style={styles.aiActionBar}>
          <TouchableOpacity
            accessibilityLabel="根据当前布局生成 Mock 概念图"
            accessibilityRole="button"
            accessibilityState={{ disabled: !sceneReady }}
            disabled={!sceneReady}
            style={[styles.aiButton, !sceneReady ? styles.actionDisabled : null]}
            activeOpacity={0.88}
            onPress={handleGenerateRender}
          >
            <Text style={styles.aiButtonTitle}>生成 Mock 效果图</Text>
            <Text style={styles.aiButtonSubtitle}>根据当前布局输出概念预览</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomActions}>
          <TouchableOpacity
            accessibilityLabel="锁定当前选中的家具"
            accessibilityRole="button"
            accessibilityState={{ disabled: !sceneReady }}
            disabled={!sceneReady}
            style={[styles.secondaryButton, styles.lockButton, !sceneReady ? styles.actionDisabled : null]}
            activeOpacity={0.86}
            onPress={() => webViewRef.current?.sendMessage({ type: "LOCK_SELECTED" })}
          >
            <Text style={[styles.secondaryButtonText, styles.lockButtonText]}>锁定家具</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="重置 3D 场景视角"
            accessibilityRole="button"
            accessibilityState={{ disabled: !sceneReady }}
            disabled={!sceneReady}
            style={[styles.secondaryButton, styles.resetButton, !sceneReady ? styles.actionDisabled : null]}
            activeOpacity={0.86}
            onPress={() => webViewRef.current?.sendMessage({ type: "RESET_CAMERA" })}
          >
            <Text style={styles.secondaryButtonText}>重置视角</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="删除当前选中的家具"
            accessibilityRole="button"
            accessibilityState={{ disabled: !sceneReady }}
            disabled={!sceneReady}
            style={[styles.secondaryButton, styles.deleteButton, !sceneReady ? styles.actionDisabled : null]}
            activeOpacity={0.86}
            onPress={() => webViewRef.current?.sendMessage({ type: "DELETE_SELECTED" })}
          >
            <Text style={[styles.secondaryButtonText, styles.deleteButtonText]}>删除家具</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

type RenderPreviewModalProps = {
  visible: boolean;
  loading: boolean;
  stepIndex: number;
  preview: RenderPreview | null;
  onClose: () => void;
  onSave: () => void;
};

function RenderPreviewModal({ visible, loading, stepIndex, preview, onClose, onSave }: RenderPreviewModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.renderSheet}>
          <View style={styles.renderHeader}>
            <View>
              <Text style={styles.renderKicker}>Mock 效果图预览</Text>
              <Text style={styles.renderTitle}>生成概念效果预览</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="关闭 Mock 概念图预览"
              accessibilityRole="button"
              style={styles.closeButton}
              activeOpacity={0.82}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.renderLoadingBody}>
              <ActivityIndicator color="#2f2a22" />
              <Text style={styles.renderLoadingTitle}>{renderStepMessages[stepIndex]}</Text>
              <Text style={styles.renderLoadingText}>Roomark 正在读取房间尺寸、家具位置和租房小空间风格。</Text>
              <View style={styles.renderStepList}>
                {renderStepMessages.map((message, index) => (
                  <View key={message} style={[styles.renderStepItem, index <= stepIndex ? styles.renderStepItemActive : null]}>
                    <View style={[styles.renderStepDot, index <= stepIndex ? styles.renderStepDotActive : null]} />
                    <Text style={[styles.renderStepText, index <= stepIndex ? styles.renderStepTextActive : null]}>{message}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.renderScroll}>
              <View style={styles.mockImageCard}>
                <View style={styles.mockCeilingLight} />
                <View style={styles.mockLightWash} />
                <View style={styles.mockWindow} />
                <View style={styles.mockCurtain} />
                <View style={styles.mockWallArt} />
                <View style={styles.mockCabinet} />
                <View style={styles.mockFloor}>
                  <View style={styles.mockFloorLineA} />
                  <View style={styles.mockFloorLineB} />
                  <View style={styles.mockRug} />
                  <View style={styles.mockSofa} />
                  <View style={styles.mockTable} />
                  <View style={styles.mockPlant} />
                </View>
                <View style={styles.mockImageBadge}>
                  <Text style={styles.mockImageBadgeText}>Mock 概念图</Text>
                </View>
              </View>

              <Text style={styles.summaryTitle}>生成依据</Text>
              <View style={styles.basisGrid}>
                <View style={styles.basisCard}>
                  <Text style={styles.basisLabel}>房间尺寸</Text>
                  <Text style={styles.basisValue}>{preview?.basis.roomSize}</Text>
                </View>
                <View style={styles.basisCard}>
                  <Text style={styles.basisLabel}>家具数量</Text>
                  <Text style={styles.basisValue}>{preview?.basis.furnitureCount} 件</Text>
                </View>
                <View style={styles.basisCard}>
                  <Text style={styles.basisLabel}>风格</Text>
                  <Text style={styles.basisValue}>{preview?.basis.style}</Text>
                </View>
              </View>
              <View style={styles.layoutBasisCard}>
                <Text style={styles.basisLabel}>布局摘要</Text>
                <Text style={styles.layoutBasisText}>{preview?.basis.layoutSummary}</Text>
              </View>

              <Text style={styles.summaryTitle}>中文摘要</Text>
              <Text style={styles.summaryText}>{preview?.summary}</Text>

              <Text style={styles.summaryTitle}>生成提示词</Text>
              <Text style={styles.promptText}>{preview?.renderPrompt}</Text>

              <TouchableOpacity
                accessibilityLabel="保存 Mock 概念图到房源库"
                accessibilityRole="button"
                style={styles.saveRenderButton}
                activeOpacity={0.88}
                onPress={onSave}
              >
                <Text style={styles.saveRenderButtonText}>保存 Mock 效果图</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f0e5d7",
    flex: 1
  },
  shell: {
    flex: 1,
    position: "relative"
  },
  loadingPage: {
    alignItems: "center",
    backgroundColor: "#f7f1e8",
    flex: 1,
    justifyContent: "center"
  },
  loadingText: {
    color: "#6d6257",
    fontSize: 15,
    marginTop: 12
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    left: 14,
    position: "absolute",
    right: 14,
    top: 10,
    zIndex: 30
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 250, 242, 0.94)",
    borderColor: "#e3d5c2",
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowColor: "#6b5138",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    width: 48
  },
  iconButtonActive: {
    backgroundColor: "#2f2a22",
    borderColor: "#2f2a22"
  },
  iconButtonText: {
    color: "#2f2a22",
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40
  },
  menuIcon: {
    color: "#2f2a22",
    fontSize: 22,
    fontWeight: "900"
  },
  menuIconActive: {
    color: "#fff8ef"
  },
  titleBlock: {
    backgroundColor: "rgba(255, 250, 242, 0.94)",
    borderColor: "#e3d5c2",
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  kicker: {
    color: "#806f5a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  title: {
    color: "#2f2a22",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 2
  },
  roomSize: {
    color: "#7a7064",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2
  },
  statusStack: {
    alignItems: "center",
    bottom: 154,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 30
  },
  statusPill: {
    backgroundColor: "rgba(47, 42, 34, 0.84)",
    borderRadius: 999,
    maxWidth: "92%",
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  statusText: {
    color: "#fff8ef",
    fontSize: 13,
    fontWeight: "800"
  },
  recoveryNotice: {
    backgroundColor: "rgba(255, 244, 220, 0.96)",
    borderColor: "#d7a85d",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    maxWidth: "92%",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  recoveryNoticeText: {
    color: "#6f4b18",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center"
  },
  savePill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 250, 242, 0.92)",
    borderColor: "#e1d4c0",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  saveDot: {
    backgroundColor: "#6d9b70",
    borderRadius: 999,
    height: 7,
    marginRight: 7,
    width: 7
  },
  savePillText: {
    color: "#5f574f",
    fontSize: 12,
    fontWeight: "800"
  },
  retrySaveButton: {
    alignItems: "center",
    backgroundColor: "#8e3f31",
    borderRadius: 999,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 16
  },
  retrySaveButtonDisabled: {
    opacity: 0.55
  },
  retrySaveButtonText: {
    color: "#fff8ef",
    fontSize: 12,
    fontWeight: "900"
  },
  selectionPill: {
    backgroundColor: "rgba(255, 250, 242, 0.92)",
    borderColor: "#e1d4c0",
    borderRadius: 999,
    borderWidth: 1,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: "absolute",
    top: 86,
    zIndex: 28
  },
  selectionText: {
    color: "#6a5e51",
    fontSize: 12,
    fontWeight: "800"
  },
  aiActionBar: {
    bottom: 78,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 30
  },
  aiButton: {
    alignItems: "center",
    backgroundColor: "#fffaf2",
    borderColor: "#d8c5aa",
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 58,
    justifyContent: "center",
    shadowColor: "#6b5138",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  aiButtonTitle: {
    color: "#2f2a22",
    fontSize: 16,
    fontWeight: "900"
  },
  aiButtonSubtitle: {
    color: "#806f5a",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2
  },
  bottomActions: {
    bottom: 20,
    flexDirection: "row",
    gap: 8,
    left: 14,
    position: "absolute",
    right: 14,
    zIndex: 30
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 250, 242, 0.96)",
    borderColor: "#e1d4c0",
    borderRadius: 17,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#332d25",
    fontSize: 13,
    fontWeight: "900"
  },
  actionDisabled: {
    opacity: 0.48
  },
  lockButton: {
    backgroundColor: "#2f2a22",
    borderColor: "#2f2a22",
    flex: 1.08
  },
  lockButtonText: {
    color: "#fff8ef"
  },
  resetButton: {
    backgroundColor: "rgba(245, 237, 223, 0.94)"
  },
  deleteButton: {
    backgroundColor: "rgba(255, 236, 226, 0.96)",
    borderColor: "#efc3b3"
  },
  deleteButtonText: {
    color: "#a4432e"
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(47, 42, 34, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  renderSheet: {
    backgroundColor: "#fffaf2",
    borderColor: "#e1d4c0",
    borderRadius: 30,
    borderWidth: 1,
    maxHeight: "88%",
    overflow: "hidden",
    width: "100%"
  },
  renderHeader: {
    alignItems: "center",
    borderBottomColor: "#eadfce",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18
  },
  renderKicker: {
    color: "#8a765d",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  renderTitle: {
    color: "#2f2a22",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#f1e8db",
    borderRadius: 16,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  closeButtonText: {
    color: "#40372e",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  renderLoadingBody: {
    alignItems: "center",
    minHeight: 330,
    justifyContent: "center",
    padding: 26
  },
  renderLoadingTitle: {
    color: "#2f2a22",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 14
  },
  renderLoadingText: {
    color: "#74685c",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center"
  },
  renderStepList: {
    alignSelf: "stretch",
    gap: 9,
    marginTop: 22
  },
  renderStepItem: {
    alignItems: "center",
    backgroundColor: "#f4ecdf",
    borderColor: "#eadfce",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 44,
    paddingHorizontal: 12
  },
  renderStepItemActive: {
    backgroundColor: "#fff7ea",
    borderColor: "#d9bd92"
  },
  renderStepDot: {
    backgroundColor: "#d1c1ad",
    borderRadius: 999,
    height: 8,
    marginRight: 9,
    width: 8
  },
  renderStepDotActive: {
    backgroundColor: "#c88b3d"
  },
  renderStepText: {
    color: "#897b6b",
    fontSize: 13,
    fontWeight: "800"
  },
  renderStepTextActive: {
    color: "#3d3429"
  },
  renderScroll: {
    padding: 18,
    paddingBottom: 22
  },
  mockImageCard: {
    backgroundColor: "#efe2d0",
    borderColor: "#dfcdb4",
    borderRadius: 26,
    borderWidth: 1,
    height: 230,
    overflow: "hidden",
    position: "relative"
  },
  mockCeilingLight: {
    backgroundColor: "#f7e5b8",
    borderRadius: 999,
    height: 10,
    left: 132,
    position: "absolute",
    top: 12,
    width: 70,
    zIndex: 4
  },
  mockLightWash: {
    backgroundColor: "rgba(255, 244, 204, 0.44)",
    borderRadius: 999,
    height: 170,
    position: "absolute",
    right: -26,
    top: -24,
    width: 178
  },
  mockWindow: {
    backgroundColor: "#b9d7d3",
    borderColor: "#fffaf2",
    borderRadius: 12,
    borderWidth: 4,
    height: 74,
    left: 24,
    position: "absolute",
    top: 24,
    width: 104
  },
  mockCurtain: {
    backgroundColor: "rgba(242, 225, 202, 0.86)",
    borderRadius: 10,
    height: 86,
    left: 18,
    position: "absolute",
    top: 18,
    width: 18
  },
  mockWallArt: {
    backgroundColor: "#c79b78",
    borderColor: "#fffaf2",
    borderRadius: 16,
    borderWidth: 5,
    height: 54,
    position: "absolute",
    right: 28,
    top: 34,
    width: 74
  },
  mockCabinet: {
    backgroundColor: "#b89c78",
    borderColor: "rgba(255, 250, 242, 0.7)",
    borderRadius: 14,
    borderWidth: 2,
    bottom: 76,
    height: 58,
    position: "absolute",
    right: 28,
    width: 72
  },
  mockFloor: {
    backgroundColor: "#d3b895",
    bottom: 0,
    height: 92,
    left: 0,
    position: "absolute",
    right: 0
  },
  mockFloorLineA: {
    backgroundColor: "rgba(126, 98, 63, 0.15)",
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 28
  },
  mockFloorLineB: {
    backgroundColor: "rgba(126, 98, 63, 0.12)",
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 58
  },
  mockRug: {
    backgroundColor: "#f3eadc",
    borderRadius: 999,
    bottom: 18,
    height: 42,
    left: 70,
    position: "absolute",
    right: 70
  },
  mockSofa: {
    backgroundColor: "#a98467",
    borderRadius: 18,
    bottom: 54,
    height: 54,
    left: 34,
    position: "absolute",
    width: 140
  },
  mockTable: {
    backgroundColor: "#7f6a52",
    borderRadius: 999,
    bottom: 36,
    height: 32,
    left: 160,
    position: "absolute",
    width: 76
  },
  mockPlant: {
    backgroundColor: "#6d9b70",
    borderRadius: 999,
    bottom: 60,
    height: 48,
    position: "absolute",
    right: 34,
    width: 34
  },
  mockImageBadge: {
    backgroundColor: "rgba(47, 42, 34, 0.82)",
    borderRadius: 999,
    bottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: "absolute",
    right: 14
  },
  mockImageBadgeText: {
    color: "#fff8ef",
    fontSize: 12,
    fontWeight: "900"
  },
  summaryTitle: {
    color: "#2f2a22",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 16
  },
  basisGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8
  },
  basisCard: {
    backgroundColor: "#f5eddf",
    borderColor: "#eadbc6",
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "30%",
    padding: 11
  },
  basisLabel: {
    color: "#8a765d",
    fontSize: 11,
    fontWeight: "900"
  },
  basisValue: {
    color: "#2f2a22",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  layoutBasisCard: {
    backgroundColor: "#fff7ea",
    borderColor: "#eadbc6",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  layoutBasisText: {
    color: "#5f574f",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5
  },
  summaryText: {
    color: "#63594f",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7
  },
  promptText: {
    backgroundColor: "#f5eddf",
    borderColor: "#eadbc6",
    borderRadius: 18,
    borderWidth: 1,
    color: "#5f574f",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    padding: 12
  },
  saveRenderButton: {
    alignItems: "center",
    backgroundColor: "#2f2a22",
    borderRadius: 18,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50
  },
  saveRenderButtonText: {
    color: "#fff8ef",
    fontSize: 16,
    fontWeight: "900"
  }
});
