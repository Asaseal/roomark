import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { FurnishProject, RoomMesh } from "../types/furnish";
import type { InspectionStatus, PropertyProfile } from "../types/property";

export type { PropertyProfile } from "../types/property";

type RoomDetailScreenProps = {
  room: RoomMesh;
  project?: FurnishProject;
  profile: PropertyProfile;
  onBack: () => void;
  onStartFurnish: () => void;
};

const statusConfig: Record<InspectionStatus, { label: string; color: string; backgroundColor: string }> = {
  normal: {
    label: "正常",
    color: "#31533d",
    backgroundColor: "#dceade"
  },
  attention: {
    label: "注意",
    color: "#7d5524",
    backgroundColor: "#efe0c2"
  },
  risk: {
    label: "风险",
    color: "#9b3f2f",
    backgroundColor: "#f3d8ce"
  }
};

function formatRoomSize(room: RoomMesh) {
  return `${room.width}m × ${room.depth}m × ${room.height}m`;
}

function formatClockTime(updatedAt?: string) {
  if (!updatedAt) {
    return "暂无记录";
  }

  const date = new Date(updatedAt);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export default function RoomDetailScreen({ room, project, profile, onBack, onStartFurnish }: RoomDetailScreenProps) {
  const furnitureCount = project?.placedFurniture.length ?? 0;
  const hasFurnishLayout = furnitureCount > 0;
  const hasRenderPreview = Boolean(project?.renderPreview);
  const previewTime = formatClockTime(project?.renderPreview?.savedAt ?? project?.renderPreview?.createdAt);
  const lastSavedTime = formatClockTime(project?.renderPreview?.savedAt ?? project?.updatedAt);
  const issueCount = profile.inspection.filter((item) => item.status !== "normal").length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.84} onPress={onBack}>
          <Text style={styles.backButtonText}>返回 Library</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>房源详情</Text>
              <Text style={styles.title}>{room.name}</Text>
              <Text style={styles.subtitle}>{formatRoomSize(room)} · {profile.area} · 已扫描房型</Text>
            </View>
            <View style={[styles.riskBadge, profile.highRiskCount > 0 ? styles.riskBadgeHigh : null]}>
              <Text style={[styles.riskBadgeText, profile.highRiskCount > 0 ? styles.riskBadgeTextHigh : null]}>{profile.riskSummary}</Text>
            </View>
          </View>

          <View style={styles.decisionCard}>
            <View style={styles.decisionTopRow}>
              <Text style={styles.decisionLabel}>租住判断</Text>
              <Text style={[styles.decisionTag, profile.highRiskCount > 0 ? styles.decisionTagRisk : null]}>{profile.recommendationTag}</Text>
            </View>
            <Text style={styles.decisionText}>{profile.decisionSummary}</Text>
            <Text style={styles.decisionNext}>下一步：先模拟软装，再决定是否约二次看房。</Text>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>月租</Text>
              <Text style={styles.metricValue}>{profile.monthlyRent}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>押金</Text>
              <Text style={styles.metricValue}>{profile.deposit}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>一次性费用</Text>
              <Text style={styles.metricValue}>{profile.oneTimeFees}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>总入住成本</Text>
              <Text style={styles.metricValue}>{profile.totalMoveInCost}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>通勤</Text>
              <Text style={styles.metricValue}>{profile.commuteTime}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>面积 / 层高</Text>
              <Text style={styles.metricValue}>{profile.area} / {room.height}m</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>模拟与概念图</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>软装模拟</Text>
              <Text style={styles.statusValue}>{hasFurnishLayout ? "已模拟" : "未开始"}</Text>
              <Text style={styles.statusMeta}>已摆放 {furnitureCount} 件家具</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Mock 概念图</Text>
              <Text style={styles.statusValue}>{hasRenderPreview ? "已保存" : "未创建"}</Text>
              <Text style={styles.statusMeta}>{hasRenderPreview ? `最近保存 ${previewTime}` : "进入软装后创建"}</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>最近保存</Text>
              <Text style={styles.statusValue}>{lastSavedTime}</Text>
              <Text style={styles.statusMeta}>{project ? "本地自动保存" : "暂无软装记录"}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.88} onPress={onStartFurnish}>
            <Text style={styles.primaryButtonText}>{hasFurnishLayout || hasRenderPreview ? "继续模拟软装" : "开始模拟软装"}</Text>
            <Text style={styles.primaryButtonSubText}>验证家具摆放，并保存概念预览</Text>
          </TouchableOpacity>

          <View style={styles.aiStateCard}>
            <View>
              <Text style={styles.aiStateTitle}>查看 Mock 概念图状态</Text>
              <Text style={styles.aiStateText}>{hasRenderPreview ? `Mock 概念图已保存，可继续调整 · ${previewTime}` : "摆好家具后，可创建本地概念预览。"}</Text>
            </View>
            {hasRenderPreview ? (
              <View style={styles.renderPreviewMini}>
                <View style={styles.renderPreviewMiniLight} />
                <View style={styles.renderPreviewMiniWindow} />
                <View style={styles.renderPreviewMiniFloor}>
                  <View style={styles.renderPreviewMiniSofa} />
                </View>
              </View>
            ) : null}
            <Text style={[styles.aiStateBadge, hasRenderPreview ? styles.aiStateBadgeActive : null]}>{hasRenderPreview ? "已保存" : "待创建"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>风险摘要</Text>
            <Text style={styles.sectionBadge}>{profile.pendingCount} 项待确认 / {profile.highRiskCount} 项高风险</Text>
          </View>
          <Text style={styles.sectionDescription}>这些是看房现场最容易遗漏、但会影响是否值得租的检查点。</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>风险证据包</Text>
            <Text style={styles.sectionBadge}>记录单预览</Text>
          </View>
          <View style={styles.evidenceGrid}>
            <View style={styles.evidenceCard}>
              <Text style={styles.evidenceValue}>{issueCount}</Text>
              <Text style={styles.evidenceLabel}>已记录问题</Text>
            </View>
            <View style={styles.evidenceCard}>
              <Text style={styles.evidenceValue}>{profile.highRiskCount}</Text>
              <Text style={styles.evidenceLabel}>高风险项</Text>
            </View>
            <View style={styles.evidenceCardWide}>
              <Text style={styles.evidenceLabel}>看房记录摘要</Text>
              <Text style={styles.evidenceText}>本地记录预览：已整理风险标签、现场备注、软装状态和 Mock 概念图状态。</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>看房记录</Text>
          <View style={styles.inspectionList}>
            {profile.inspection.map((item) => {
              const config = statusConfig[item.status];

              return (
                <View key={item.label} style={styles.inspectionItem}>
                  <View>
                    <Text style={styles.inspectionLabel}>{item.label}</Text>
                    <Text style={styles.inspectionNote}>{item.note}</Text>
                  </View>
                  <Text style={[styles.inspectionStatus, { backgroundColor: config.backgroundColor, color: config.color }]}>{config.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>房源对比信息</Text>
          <View style={styles.compareCard}>
            <Text style={styles.compareTag}>{profile.recommendationTag}</Text>
            <Text style={styles.compareLabel}>{profile.compareLabel}</Text>
            <Text style={styles.compareText}>家具适配度：{profile.furnitureFit}。建议结合租金、通勤、风险项和软装可行性一起判断，而不是只看面积。</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f7f1e8",
    flex: 1
  },
  container: {
    padding: 20,
    paddingBottom: 42
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#fffaf2",
    borderColor: "#eadfce",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 14,
    paddingHorizontal: 14
  },
  backButtonText: {
    color: "#4f453a",
    fontSize: 14,
    fontWeight: "900"
  },
  heroCard: {
    backgroundColor: "#fffaf2",
    borderColor: "#eadfce",
    borderRadius: 30,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#7b5b33",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20
  },
  heroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  titleBlock: {
    flex: 1
  },
  eyebrow: {
    color: "#8a765d",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  title: {
    color: "#28231d",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 4
  },
  subtitle: {
    color: "#6d6257",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5
  },
  riskBadge: {
    backgroundColor: "#efe0c2",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  riskBadgeHigh: {
    backgroundColor: "#f3d8ce"
  },
  riskBadgeText: {
    color: "#7d5524",
    fontSize: 12,
    fontWeight: "900"
  },
  riskBadgeTextHigh: {
    color: "#9b3f2f"
  },
  decisionCard: {
    backgroundColor: "#f4eadc",
    borderRadius: 22,
    marginTop: 18,
    padding: 14
  },
  decisionLabel: {
    color: "#8a765d",
    fontSize: 12,
    fontWeight: "900"
  },
  decisionTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  decisionTag: {
    backgroundColor: "#dceade",
    borderRadius: 999,
    color: "#31533d",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  decisionTagRisk: {
    backgroundColor: "#f3d8ce",
    color: "#9b3f2f"
  },
  decisionText: {
    color: "#2f2a22",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 5
  },
  decisionNext: {
    color: "#6b6258",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 8
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  metricCard: {
    backgroundColor: "#fff7ea",
    borderColor: "#eadbc6",
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "30%",
    padding: 12
  },
  metricLabel: {
    color: "#8a765d",
    fontSize: 11,
    fontWeight: "900"
  },
  metricValue: {
    color: "#2f2a22",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 5
  },
  section: {
    backgroundColor: "#fffaf2",
    borderColor: "#eadfce",
    borderRadius: 26,
    borderWidth: 1,
    marginTop: 14,
    padding: 16
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: "#2f2a22",
    fontSize: 19,
    fontWeight: "900"
  },
  sectionBadge: {
    backgroundColor: "#f3d8ce",
    borderRadius: 999,
    color: "#9b3f2f",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sectionDescription: {
    color: "#74685c",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  statusCard: {
    backgroundColor: "#f5eddf",
    borderRadius: 20,
    flexGrow: 1,
    minWidth: "30%",
    padding: 13
  },
  statusLabel: {
    color: "#8a765d",
    fontSize: 12,
    fontWeight: "900"
  },
  statusValue: {
    color: "#2f2a22",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5
  },
  statusMeta: {
    color: "#74685c",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2f2a22",
    borderRadius: 20,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 58
  },
  primaryButtonText: {
    color: "#fff8ef",
    fontSize: 17,
    fontWeight: "900"
  },
  primaryButtonSubText: {
    color: "#d8cbb9",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  aiStateCard: {
    alignItems: "center",
    backgroundColor: "#fff7ea",
    borderColor: "#eadbc6",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 10,
    padding: 13
  },
  aiStateTitle: {
    color: "#2f2a22",
    fontSize: 15,
    fontWeight: "900"
  },
  aiStateText: {
    color: "#74685c",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 190
  },
  renderPreviewMini: {
    backgroundColor: "#efe2d0",
    borderColor: "#dfcdb4",
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    overflow: "hidden",
    position: "relative",
    width: 64
  },
  renderPreviewMiniLight: {
    backgroundColor: "rgba(255, 243, 207, 0.62)",
    borderRadius: 999,
    height: 48,
    position: "absolute",
    right: -8,
    top: -10,
    width: 58
  },
  renderPreviewMiniWindow: {
    backgroundColor: "#b9d7d3",
    borderColor: "#fffaf2",
    borderRadius: 5,
    borderWidth: 2,
    height: 22,
    left: 8,
    position: "absolute",
    top: 8,
    width: 28
  },
  renderPreviewMiniFloor: {
    backgroundColor: "#d3b895",
    bottom: 0,
    height: 20,
    left: 0,
    position: "absolute",
    right: 0
  },
  renderPreviewMiniSofa: {
    backgroundColor: "#a98467",
    borderRadius: 7,
    bottom: 12,
    height: 16,
    left: 10,
    position: "absolute",
    width: 34
  },
  aiStateBadge: {
    backgroundColor: "#f0e7d9",
    borderRadius: 999,
    color: "#7b6a55",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  aiStateBadgeActive: {
    backgroundColor: "#efe0c2",
    color: "#7d5524"
  },
  inspectionList: {
    gap: 8,
    marginTop: 12
  },
  evidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  evidenceCard: {
    backgroundColor: "#f5eddf",
    borderRadius: 20,
    flexGrow: 1,
    minWidth: "30%",
    padding: 14
  },
  evidenceCardWide: {
    backgroundColor: "#fff7ea",
    borderColor: "#eadbc6",
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: "100%",
    padding: 14
  },
  evidenceValue: {
    color: "#2f2a22",
    fontSize: 24,
    fontWeight: "900"
  },
  evidenceLabel: {
    color: "#8a765d",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3
  },
  evidenceText: {
    color: "#74685c",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  inspectionItem: {
    alignItems: "center",
    backgroundColor: "#f7efe3",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: 12
  },
  inspectionLabel: {
    color: "#2f2a22",
    fontSize: 15,
    fontWeight: "900"
  },
  inspectionNote: {
    color: "#75685a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  inspectionStatus: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  compareCard: {
    backgroundColor: "#f5eddf",
    borderRadius: 20,
    marginTop: 10,
    padding: 14
  },
  compareLabel: {
    color: "#2f2a22",
    fontSize: 16,
    fontWeight: "900"
  },
  compareTag: {
    alignSelf: "flex-start",
    backgroundColor: "#dceade",
    borderRadius: 999,
    color: "#31533d",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  compareText: {
    color: "#74685c",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  }
});
