import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { PropertyRecord } from "../types/property";

type CompareScreenProps = {
  properties: PropertyRecord[];
  comparisonIds: string[];
  onBack: () => void;
  onOpenDetail: (property: PropertyRecord) => void;
};

export default function CompareScreen({ properties, comparisonIds, onBack, onOpenDetail }: CompareScreenProps) {
  const comparedProperties = comparisonIds
    .map((propertyId) => properties.find((property) => property.id === propertyId))
    .filter((property): property is PropertyRecord => Boolean(property));

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
        <Text style={styles.eyebrow}>房源对比</Text>
        <Text style={styles.title}>把关键差异放在一起</Text>

        {comparisonIds.length < 2 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>至少选择两套房源</Text>
            <Text style={styles.emptyText}>返回 Library，通过“加入对比”选择候选房源。</Text>
          </View>
        ) : null}

        {comparedProperties.map((property) => (
          <TouchableOpacity
            key={property.id}
            accessibilityLabel={`${property.title}，${property.monthlyRent}，入住 ${property.totalMoveInCost}，通勤 ${property.commuteTime}，高风险 ${property.highRiskCount} 项`}
            accessibilityHint={`打开 ${property.title} 房源详情`}
            accessibilityRole="button"
            style={styles.card}
            onPress={() => onOpenDetail(property)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{property.title}</Text>
              <Text style={styles.tag}>{property.recommendationTag}</Text>
            </View>
            <View style={styles.metrics}>
              <Text style={styles.metric}>{property.monthlyRent}</Text>
              <Text style={styles.metric}>入住 {property.totalMoveInCost}</Text>
              <Text style={styles.metric}>通勤 {property.commuteTime}</Text>
              <Text style={styles.metric}>高风险 {property.highRiskCount}</Text>
            </View>
            <Text style={styles.summary}>{property.decisionSummary}</Text>
          </TouchableOpacity>
        ))}
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
  title: { color: "#28231d", fontSize: 30, fontWeight: "900", marginBottom: 18, marginTop: 6 },
  emptyCard: { backgroundColor: "#efe0c2", borderRadius: 20, marginBottom: 14, padding: 18 },
  emptyTitle: { color: "#4d3d28", fontSize: 17, fontWeight: "900" },
  emptyText: { color: "#6f5a3d", fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: { backgroundColor: "#fffaf2", borderColor: "#eadfce", borderRadius: 22, borderWidth: 1, marginBottom: 13, minHeight: 44, padding: 17 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  cardTitle: { color: "#2f2a22", flex: 1, fontSize: 19, fontWeight: "900" },
  tag: { backgroundColor: "#dceade", borderRadius: 999, color: "#31533d", fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { backgroundColor: "#f1e8dc", borderRadius: 999, color: "#5d5143", fontSize: 11, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  summary: { color: "#4f463b", fontSize: 13, lineHeight: 20, marginTop: 12 }
});
