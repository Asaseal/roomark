import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { createMapBounds, filterProperties, projectProperty, type MapFilter } from "../services/mapProjection";
import type { PropertyRecord } from "../types/property";

const filters: { id: MapFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "visited", label: "看过" },
  { id: "scanned", label: "已扫描" },
  { id: "high-risk", label: "高风险" },
  { id: "favorite", label: "收藏" }
];

type PropertyMapScreenProps = {
  properties: PropertyRecord[];
  onBack: () => void;
  onOpenDetail: (property: PropertyRecord) => void;
  onStartFurnish: (property: PropertyRecord) => void;
};

export default function PropertyMapScreen({ properties, onBack, onOpenDetail, onStartFurnish }: PropertyMapScreenProps) {
  const [activeFilter, setActiveFilter] = useState<MapFilter>("all");
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord>();
  const bounds = useMemo(() => createMapBounds(properties), [properties]);
  const visibleProperties = filterProperties(properties, activeFilter);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity
          accessibilityLabel="返回房源库"
          accessibilityRole="button"
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>返回 Library</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>离线看房地图</Text>
        <Text style={styles.title}>按现场状态查看房源</Text>
        <Text style={styles.note}>地图仅展示已保存房源位置，不提供路线或推荐。</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              accessibilityLabel={`筛选：${filter.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: activeFilter === filter.id }}
              style={[styles.filterButton, activeFilter === filter.id ? styles.filterButtonActive : null]}
              onPress={() => {
                setActiveFilter(filter.id);
                setSelectedProperty(undefined);
              }}
            >
              <Text style={[styles.filterText, activeFilter === filter.id ? styles.filterTextActive : null]}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.mapCanvas}>
          <View style={styles.roadHorizontal} />
          <View style={styles.roadVertical} />
          {visibleProperties.map((property) => {
            const point = projectProperty(property, bounds);
            return (
              <TouchableOpacity
                key={property.id}
                accessibilityLabel={`${property.title}，${property.riskSummary}`}
                accessibilityHint={`选择 ${property.title} 并查看地图摘要`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedProperty?.id === property.id }}
                style={[
                  styles.marker,
                  property.highRiskCount > 0 ? styles.markerRisk : property.hasScan ? styles.markerScanned : null,
                  { left: `${point.x}%`, top: `${point.y}%` }
                ]}
                onPress={() => setSelectedProperty(property)}
              >
                <Text style={styles.markerText}>{property.monthlyRent === "待补充" ? "新" : property.monthlyRent.replace("¥", "")}</Text>
              </TouchableOpacity>
            );
          })}
          {visibleProperties.length === 0 ? <Text style={styles.emptyMap}>当前筛选没有房源</Text> : null}
        </View>

        {selectedProperty ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{selectedProperty.title}</Text>
              <Text style={styles.sheetTag}>{selectedProperty.recommendationTag}</Text>
            </View>
            <Text style={styles.sheetMeta}>{selectedProperty.monthlyRent} · 通勤 {selectedProperty.commuteTime}</Text>
            <Text style={styles.sheetRisk}>{selectedProperty.riskSummary}</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                accessibilityLabel={`打开 ${selectedProperty.title} 房源详情`}
                accessibilityRole="button"
                style={styles.sheetButton}
                onPress={() => onOpenDetail(selectedProperty)}
              >
                <Text style={styles.sheetButtonText}>查看详情</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={`开始 ${selectedProperty.title} 模拟软装`}
                accessibilityRole="button"
                style={styles.sheetButtonDark}
                onPress={() => onStartFurnish(selectedProperty)}
              >
                <Text style={styles.sheetButtonDarkText}>模拟软装</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#f7f1e8", flex: 1 },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#fffaf2", borderRadius: 14, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  backText: { color: "#51483e", fontSize: 13, fontWeight: "900" },
  eyebrow: { color: "#7b6a55", fontSize: 12, fontWeight: "900", letterSpacing: 0.7, marginTop: 24 },
  title: { color: "#28231d", fontSize: 29, fontWeight: "900", marginTop: 6 },
  note: { color: "#6b6258", fontSize: 13, marginTop: 7 },
  filters: { gap: 8, paddingVertical: 16 },
  filterButton: { alignItems: "center", backgroundColor: "#fffaf2", borderRadius: 999, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  filterButtonActive: { backgroundColor: "#2f2a22" },
  filterText: { color: "#5d5143", fontSize: 12, fontWeight: "900" },
  filterTextActive: { color: "#fff8ef" },
  mapCanvas: { backgroundColor: "#e7dfd2", borderColor: "#d1c3b1", borderRadius: 26, borderWidth: 1, height: 390, overflow: "hidden", position: "relative" },
  roadHorizontal: { backgroundColor: "#f7f1e8", height: 30, left: 0, position: "absolute", right: 0, top: "44%", transform: [{ rotate: "-8deg" }] },
  roadVertical: { backgroundColor: "#f7f1e8", bottom: 0, left: "57%", position: "absolute", top: 0, transform: [{ rotate: "13deg" }], width: 26 },
  marker: { alignItems: "center", backgroundColor: "#7b6a55", borderColor: "#fffaf2", borderRadius: 18, borderWidth: 3, height: 40, justifyContent: "center", marginLeft: -20, marginTop: -20, position: "absolute", width: 40 },
  markerRisk: { backgroundColor: "#a84d3e" },
  markerScanned: { backgroundColor: "#31533d" },
  markerText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  emptyMap: { alignSelf: "center", color: "#786e62", fontSize: 14, fontWeight: "800", marginTop: 175 },
  sheet: { backgroundColor: "#fffaf2", borderColor: "#eadfce", borderRadius: 22, borderWidth: 1, marginTop: 14, padding: 16 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  sheetTitle: { color: "#2f2a22", flex: 1, fontSize: 19, fontWeight: "900" },
  sheetTag: { backgroundColor: "#dceade", borderRadius: 999, color: "#31533d", fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  sheetMeta: { color: "#655b50", fontSize: 13, marginTop: 9 },
  sheetRisk: { color: "#7d4f40", fontSize: 13, fontWeight: "800", marginTop: 7 },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 13 },
  sheetButton: { alignItems: "center", backgroundColor: "#efe4d5", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 44 },
  sheetButtonText: { color: "#574b3d", fontSize: 13, fontWeight: "900" },
  sheetButtonDark: { alignItems: "center", backgroundColor: "#2f2a22", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 44 },
  sheetButtonDarkText: { color: "#fff8ef", fontSize: 13, fontWeight: "900" }
});
