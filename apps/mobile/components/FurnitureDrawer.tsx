import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { furnitureAssets, furnitureCategoryLabels } from "../webview/furnish-scene/furnitureRegistry";
import type { FurnitureAsset } from "../types/furnish";

type FurnitureDrawerProps = {
  open: boolean;
  onSelectAsset: (asset: FurnitureAsset) => void;
};

export default function FurnitureDrawer({ open, onSelectAsset }: FurnitureDrawerProps) {
  const groupedAssets = useMemo(
    () =>
      furnitureAssets.reduce<Record<FurnitureAsset["category"], FurnitureAsset[]>>(
        (groups, asset) => ({
          ...groups,
          [asset.category]: [...(groups[asset.category] ?? []), asset]
        }),
        {
          sofa: [],
          table: [],
          chair: [],
          bed: [],
          storage: []
        }
      ),
    []
  );

  return (
    <View pointerEvents={open ? "auto" : "none"} style={[styles.drawer, open ? styles.drawerOpen : styles.drawerClosed]}>
      <View style={styles.handle} />
      <Text style={styles.drawerTitle}>选择家具</Text>
      <Text style={styles.drawerSubtitle}>添加后拖到地面摆放。</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerScroll}>
        {Object.entries(groupedAssets).map(([category, assets]) => (
          <View key={category} style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>{furnitureCategoryLabels[category as FurnitureAsset["category"]]}</Text>
            {assets.map((asset) => (
              <TouchableOpacity key={asset.id} activeOpacity={0.82} style={styles.assetRow} onPress={() => onSelectAsset(asset)}>
                <View style={styles.assetIcon}>
                  <Text style={styles.assetIconText}>{asset.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.assetCopy}>
                  <Text style={styles.assetName}>{asset.name}</Text>
                  <Text style={styles.assetDescription}>{asset.description}</Text>
                </View>
                <Text style={styles.addHint}>放入</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: "#fffaf2",
    borderColor: "#e1d4c0",
    borderRightWidth: 1,
    bottom: 0,
    left: 0,
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: 82,
    position: "absolute",
    top: 0,
    width: 268,
    zIndex: 20
  },
  drawerOpen: {
    transform: [{ translateX: 0 }]
  },
  drawerClosed: {
    transform: [{ translateX: -278 }]
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#dfd0ba",
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 42
  },
  drawerTitle: {
    color: "#2b261f",
    fontSize: 23,
    fontWeight: "900"
  },
  drawerSubtitle: {
    color: "#776b5e",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5
  },
  drawerScroll: {
    paddingBottom: 32
  },
  categoryBlock: {
    marginTop: 20
  },
  categoryTitle: {
    color: "#8b7559",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 8
  },
  assetRow: {
    alignItems: "center",
    backgroundColor: "#f5eddf",
    borderColor: "#eadbc6",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 9,
    minHeight: 68,
    padding: 10
  },
  assetIcon: {
    alignItems: "center",
    backgroundColor: "#2f2a22",
    borderRadius: 16,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  assetIconText: {
    color: "#fff8ef",
    fontSize: 18,
    fontWeight: "900"
  },
  assetCopy: {
    flex: 1,
    marginLeft: 10
  },
  assetName: {
    color: "#2f2a22",
    fontSize: 15,
    fontWeight: "900"
  },
  assetDescription: {
    color: "#7a7064",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2
  },
  addHint: {
    backgroundColor: "#fffaf2",
    borderRadius: 999,
    color: "#6d5d49",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  }
});
