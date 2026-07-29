import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { FurnishProject } from "../types/furnish";
import type { PropertyRecord } from "../types/property";

const minimumTouchTarget = 44;

type LibraryScreenProps = {
  properties: PropertyRecord[];
  projectsByRoomId: Record<string, FurnishProject>;
  comparisonIds: string[];
  hydrationError?: string;
  persistenceError?: string;
  pendingPersistence: boolean;
  onRetryPersistence: () => void;
  onDismissPersistenceError: () => void;
  onOpenDetail: (property: PropertyRecord) => void;
  onToggleComparison: (propertyId: string) => void;
  onOpenCompare: () => void;
  onOpenScan: () => void;
  onOpenMap: () => void;
  onStartFurnish: (property: PropertyRecord) => void;
};

export default function LibraryScreen({
  properties,
  projectsByRoomId,
  comparisonIds,
  hydrationError,
  persistenceError,
  pendingPersistence,
  onRetryPersistence,
  onDismissPersistenceError,
  onOpenDetail,
  onToggleComparison,
  onOpenCompare,
  onOpenScan,
  onOpenMap,
  onStartFurnish
}: LibraryScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>ROOMARK · 现场看房工具</Text>
        <Text style={styles.title}>我的看房记录</Text>
        <Text style={styles.subtitle}>成本、通勤、风险、扫描与软装结果都保存在当前设备。</Text>

        {hydrationError ? (
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.warning}>
            {hydrationError}
          </Text>
        ) : null}

        {persistenceError ? (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.persistenceWarning}>
            <Text style={styles.persistenceWarningTitle}>{persistenceError}</Text>
            <Text style={styles.persistenceWarningText}>关闭 App 前请确认保存成功。</Text>
            <View style={styles.persistenceActions}>
              <TouchableOpacity
                accessibilityLabel={pendingPersistence ? "正在保存看房记录" : "重试保存看房记录"}
                accessibilityRole="button"
                accessibilityState={{ disabled: pendingPersistence }}
                disabled={pendingPersistence}
                style={[styles.persistenceRetry, pendingPersistence ? styles.persistenceRetryDisabled : null]}
                onPress={onRetryPersistence}
              >
                <Text style={styles.persistenceRetryText}>{pendingPersistence ? "正在保存…" : "重试保存"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="稍后处理保存失败提示"
                accessibilityRole="button"
                style={styles.persistenceDismiss}
                onPress={onDismissPersistenceError}
              >
                <Text style={styles.persistenceDismissText}>稍后处理</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryAction} onPress={onOpenScan}>
            <Text style={styles.primaryActionText}>模拟扫描</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} onPress={onOpenMap}>
            <Text style={styles.secondaryActionText}>看房地图</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} onPress={onOpenCompare}>
            <Text style={styles.secondaryActionText}>对比 {comparisonIds.length}</Text>
          </TouchableOpacity>
        </View>

        {properties.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.cardTitle}>还没有看房记录</Text>
            <Text style={styles.cardMeta}>从模拟扫描开始，结果会自动保存到这里。</Text>
          </View>
        ) : null}

        {properties.map((property) => {
          const project = projectsByRoomId[property.id];
          const furnitureCount = project?.placedFurniture.length ?? 0;
          const selectedForComparison = comparisonIds.includes(property.id);
          const renderStatus = project?.renderPreview ? "Mock 效果图已保存" : "Mock 效果图未生成";

          return (
            <View key={property.id} style={styles.propertyCard}>
              <TouchableOpacity style={styles.cardMain} onPress={() => onOpenDetail(property)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{property.title}</Text>
                  <Text style={[styles.riskBadge, property.highRiskCount > 0 ? styles.riskBadgeHigh : null]}>
                    {property.riskSummary}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>
                  {property.monthlyRent} · 入住 {property.totalMoveInCost} · 通勤 {property.commuteTime}
                </Text>
                <Text style={styles.cardMeta}>
                  {property.roomMesh.width}m × {property.roomMesh.depth}m × {property.roomMesh.height}m · 已摆放 {furnitureCount} 件 · {renderStatus}
                </Text>
                <Text style={styles.decision}>{property.decisionSummary}</Text>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.cardButton} onPress={() => onToggleComparison(property.id)}>
                  <Text style={styles.cardButtonText}>{selectedForComparison ? "移出对比" : "加入对比"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cardButtonDark} onPress={() => onStartFurnish(property)}>
                  <Text style={styles.cardButtonDarkText}>{furnitureCount > 0 ? "继续软装" : "开始软装"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#f7f1e8", flex: 1 },
  container: { padding: 20, paddingBottom: 44 },
  eyebrow: { color: "#7b6a55", fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  title: { color: "#28231d", fontSize: 32, fontWeight: "900", marginTop: 6 },
  subtitle: { color: "#6b6258", fontSize: 15, lineHeight: 22, marginTop: 8 },
  warning: { backgroundColor: "#efe0c2", borderRadius: 14, color: "#6f4d25", fontWeight: "800", marginTop: 14, padding: 12 },
  persistenceWarning: { backgroundColor: "#f3d8ce", borderRadius: 16, marginTop: 14, padding: 14 },
  persistenceWarningTitle: { color: "#7f352b", fontSize: 14, fontWeight: "900" },
  persistenceWarningText: { color: "#744d45", fontSize: 12, lineHeight: 18, marginTop: 4 },
  persistenceActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  persistenceRetry: { alignItems: "center", backgroundColor: "#7f352b", borderRadius: 12, justifyContent: "center", minHeight: minimumTouchTarget, paddingHorizontal: 14 },
  persistenceRetryDisabled: { opacity: 0.55 },
  persistenceRetryText: { color: "#fff8ef", fontSize: 12, fontWeight: "900" },
  persistenceDismiss: { alignItems: "center", borderColor: "#c99c92", borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: minimumTouchTarget, paddingHorizontal: 14 },
  persistenceDismissText: { color: "#744d45", fontSize: 12, fontWeight: "900" },
  actionRow: { flexDirection: "row", gap: 8, marginVertical: 18 },
  primaryAction: { alignItems: "center", backgroundColor: "#2f2a22", borderRadius: 15, flex: 1, justifyContent: "center", minHeight: minimumTouchTarget, paddingHorizontal: 10 },
  primaryActionText: { color: "#fff8ef", fontSize: 13, fontWeight: "900" },
  secondaryAction: { alignItems: "center", backgroundColor: "#fffaf2", borderColor: "#dfd2c0", borderRadius: 15, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: minimumTouchTarget, paddingHorizontal: 8 },
  secondaryActionText: { color: "#4f463b", fontSize: 13, fontWeight: "900" },
  emptyCard: { backgroundColor: "#fffaf2", borderRadius: 22, marginBottom: 14, padding: 18 },
  propertyCard: { backgroundColor: "#fffaf2", borderColor: "#eadfce", borderRadius: 24, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  cardMain: { minHeight: minimumTouchTarget, padding: 17 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  cardTitle: { color: "#2f2a22", flex: 1, fontSize: 19, fontWeight: "900" },
  riskBadge: { backgroundColor: "#dceade", borderRadius: 999, color: "#31533d", fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  riskBadgeHigh: { backgroundColor: "#f3d8ce", color: "#8e3f31" },
  cardMeta: { color: "#746b60", fontSize: 12, lineHeight: 18, marginTop: 8 },
  decision: { color: "#433b32", fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 10 },
  cardActions: { borderTopColor: "#eadfce", borderTopWidth: 1, flexDirection: "row" },
  cardButton: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: minimumTouchTarget },
  cardButtonText: { color: "#655844", fontSize: 13, fontWeight: "900" },
  cardButtonDark: { alignItems: "center", backgroundColor: "#2f2a22", flex: 1, justifyContent: "center", minHeight: minimumTouchTarget },
  cardButtonDarkText: { color: "#fff8ef", fontSize: 13, fontWeight: "900" }
});
