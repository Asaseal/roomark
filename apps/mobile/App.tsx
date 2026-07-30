import { useEffect, useRef, useState } from "react";
import { BackHandler, SafeAreaView, StatusBar, StyleSheet, Text } from "react-native";
import { propertyCatalog } from "./data/propertyCatalog";
import type { ProductScreen } from "./navigation/productScreens";
import CompareScreen from "./screens/CompareScreen";
import FurnishStudioScreen from "./screens/FurnishStudioScreen";
import LibraryScreen from "./screens/LibraryScreen";
import PropertyMapScreen from "./screens/PropertyMapScreen";
import RoomDetailScreen from "./screens/RoomDetailScreen";
import ScanScreen from "./screens/ScanScreen";
import { useFurnishStore } from "./stores/furnishStore";
import { useProductStore } from "./stores/productStore";
import type { RoomMesh } from "./types/furnish";

export default function App() {
  const [selectedRoom, setSelectedRoom] = useState<RoomMesh | null>(null);
  const [studioRoom, setStudioRoom] = useState<RoomMesh | null>(null);
  const [activeScreen, setActiveScreen] = useState<ProductScreen>("library");
  const furnishProjectRequestsRef = useRef(new Set<string>());
  const loadProject = useFurnishStore((state) => state.loadProject);
  const projectsByRoomId = useFurnishStore((state) => state.projectsByRoomId);
  const hydrated = useProductStore((state) => state.hydrated);
  const hydrationError = useProductStore((state) => state.hydrationError);
  const persistenceError = useProductStore((state) => state.persistenceError);
  const pendingPersistence = useProductStore((state) => state.pendingPersistence);
  const hydrate = useProductStore((state) => state.hydrate);
  const propertiesById = useProductStore((state) => state.propertiesById);
  const comparisonIds = useProductStore((state) => state.comparisonIds);
  const selectProperty = useProductStore((state) => state.selectProperty);
  const toggleComparison = useProductStore((state) => state.toggleComparison);
  const saveScanResult = useProductStore((state) => state.saveScanResult);
  const updateProjectStatus = useProductStore((state) => state.updateProjectStatus);
  const retryPersistence = useProductStore((state) => state.retryPersistence);
  const dismissPersistenceError = useProductStore((state) => state.dismissPersistenceError);
  const properties = Object.values(propertiesById);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    properties.forEach((property) => {
      const roomId = property.roomMesh.id;
      if (projectsByRoomId[roomId] || furnishProjectRequestsRef.current.has(roomId)) {
        return;
      }

      furnishProjectRequestsRef.current.add(roomId);
      void loadProject(property.roomMesh).finally(() => {
        furnishProjectRequestsRef.current.delete(roomId);
      });
    });
  }, [loadProject, projectsByRoomId, propertiesById]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedRoom) {
        setSelectedRoom(null);
        setActiveScreen("library");
        return true;
      }
      if (activeScreen !== "library") {
        setActiveScreen("library");
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [activeScreen, selectedRoom]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.loadingEyebrow}>Roomark</Text>
        <Text style={styles.loadingTitle}>正在恢复看房记录…</Text>
        <Text style={styles.loadingText}>所有数据保存在当前设备，可离线使用。</Text>
      </SafeAreaView>
    );
  }

  if (studioRoom) {
    return (
      <FurnishStudioScreen
        roomMesh={studioRoom}
        onProjectStatusChanged={(project) => {
          void updateProjectStatus(
            project.roomId,
            project.placedFurniture.length,
            project.renderPreview?.status ?? "none",
            project.renderPreview?.savedAt ?? project.renderPreview?.createdAt
          );
        }}
        onBack={() => {
          setStudioRoom(null);
          setActiveScreen("library");
        }}
      />
    );
  }

  if (selectedRoom) {
    return (
      <RoomDetailScreen
        room={selectedRoom}
        project={projectsByRoomId[selectedRoom.id]}
        profile={propertiesById[selectedRoom.id] ?? propertyCatalog[0]}
        onBack={() => {
          setSelectedRoom(null);
          setActiveScreen("library");
        }}
        onStartFurnish={() => {
          setStudioRoom(selectedRoom);
          setActiveScreen("furnish");
        }}
      />
    );
  }

  if (activeScreen === "compare") {
    return (
      <CompareScreen
        properties={properties}
        comparisonIds={comparisonIds}
        onBack={() => setActiveScreen("library")}
        onOpenDetail={(property) => {
          void selectProperty(property.id);
          setSelectedRoom(property.roomMesh);
          setActiveScreen("detail");
        }}
      />
    );
  }

  if (activeScreen === "scan") {
    return (
      <ScanScreen
        onBack={() => setActiveScreen("library")}
        onSave={async (property) => {
          const persisted = await saveScanResult(property);
          if (persisted) {
            await loadProject(property.roomMesh);
          }
          return persisted;
        }}
      />
    );
  }

  if (activeScreen === "map") {
    return (
      <PropertyMapScreen
        properties={properties}
        onBack={() => setActiveScreen("library")}
        onOpenDetail={(property) => {
          void selectProperty(property.id);
          setSelectedRoom(property.roomMesh);
          setActiveScreen("detail");
        }}
        onStartFurnish={(property) => {
          void selectProperty(property.id);
          setStudioRoom(property.roomMesh);
          setActiveScreen("furnish");
        }}
      />
    );
  }

  return (
    <LibraryScreen
      properties={properties}
      projectsByRoomId={projectsByRoomId}
      comparisonIds={comparisonIds}
      hydrationError={hydrationError}
      persistenceError={persistenceError}
      pendingPersistence={pendingPersistence}
      onRetryPersistence={() => {
        void retryPersistence();
      }}
      onDismissPersistenceError={dismissPersistenceError}
      onOpenDetail={(property) => {
        void selectProperty(property.id);
        setSelectedRoom(property.roomMesh);
        setActiveScreen("detail");
      }}
      onToggleComparison={(propertyId) => {
        void toggleComparison(propertyId);
      }}
      onOpenCompare={() => setActiveScreen("compare")}
      onOpenScan={() => setActiveScreen("scan")}
      onOpenMap={() => setActiveScreen("map")}
      onStartFurnish={(property) => {
        void selectProperty(property.id);
        setStudioRoom(property.roomMesh);
        setActiveScreen("furnish");
      }}
    />
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#f7f1e8",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  loadingEyebrow: {
    color: "#8a765d",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1
  },
  loadingTitle: {
    color: "#28231d",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 10
  },
  loadingText: {
    color: "#6b6258",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center"
  }
});
