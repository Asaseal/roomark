import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createFloorPlanFallback, createScannedProperty, simulateRoomScan } from "../services/scanSimulation";
import type { RoomMesh } from "../types/furnish";
import type { PropertyRecord } from "../types/property";

type ScanMode = "mock" | "floorplan";

type ScanScreenProps = {
  onBack: () => void;
  onSave: (property: PropertyRecord) => Promise<boolean>;
};

export default function ScanScreen({ onBack, onSave }: ScanScreenProps) {
  const [mode, setMode] = useState<ScanMode>("mock");
  const [width, setWidth] = useState("4.8");
  const [depth, setDepth] = useState("3.6");
  const [height, setHeight] = useState("2.75");
  const [aspectRatio, setAspectRatio] = useState("1.4");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RoomMesh>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  function generateResult() {
    setProcessing(true);
    setError(undefined);
    setSaved(false);

    try {
      const capturedAt = new Date().toISOString();
      const id = `scan-${Date.now()}`;
      const roomMesh = mode === "mock"
        ? simulateRoomScan({
            id,
            name: "现场扫描房型",
            width: Number(width),
            depth: Number(depth),
            height: Number(height),
            capturedAt
          })
        : createFloorPlanFallback({
            id,
            name: "户型图生成房型",
            aspectRatio: Number(aspectRatio),
            height: Number(height),
            capturedAt
          });
      setResult(roomMesh);
    } catch (scanError) {
      setResult(undefined);
      setError(scanError instanceof Error ? scanError.message : "生成失败，请检查尺寸后重试。");
    } finally {
      setProcessing(false);
    }
  }

  async function saveResult() {
    if (!result || processing) {
      return;
    }
    setProcessing(true);
    setError(undefined);
    try {
      const persisted = await onSave(createScannedProperty(result));
      if (!persisted) {
        setError("保存失败，请重试。当前结果尚未写入设备。");
        return;
      }
      setSaved(true);
    } catch {
      setError("保存失败，请重试。已有房源记录不会受到影响。");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          accessibilityLabel="返回房源库"
          accessibilityRole="button"
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>返回 Library</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>现场房型记录</Text>
        <Text style={styles.title}>生成可保存的简化 3D 房型</Text>
        <Text style={styles.scopeNote}>当前版本是模拟扫描和户型图简化 3D，不是自动空间扫描。</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            accessibilityLabel="使用模拟扫描模式"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "mock" }}
            style={[styles.modeButton, mode === "mock" ? styles.modeButtonActive : null]}
            onPress={() => setMode("mock")}
          >
            <Text style={[styles.modeText, mode === "mock" ? styles.modeTextActive : null]}>模拟扫描</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="使用户型图简化 3D 模式"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "floorplan" }}
            style={[styles.modeButton, mode === "floorplan" ? styles.modeButtonActive : null]}
            onPress={() => setMode("floorplan")}
          >
            <Text style={[styles.modeText, mode === "floorplan" ? styles.modeTextActive : null]}>户型图简化 3D</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formCard}>
          {mode === "mock" ? (
            <View style={styles.fieldRow}>
              <DimensionField accessibilityLabel="房间宽度，单位米" label="宽 m" value={width} onChangeText={setWidth} />
              <DimensionField accessibilityLabel="房间深度，单位米" label="深 m" value={depth} onChangeText={setDepth} />
            </View>
          ) : (
            <DimensionField accessibilityLabel="户型图宽高比" label="户型图宽高比" value={aspectRatio} onChangeText={setAspectRatio} />
          )}
          <DimensionField accessibilityLabel="房间层高，单位米" label="层高 m" value={height} onChangeText={setHeight} />
          <TouchableOpacity
            accessibilityLabel={processing ? "正在生成简化房型" : "生成简化房型"}
            accessibilityRole="button"
            accessibilityState={{ disabled: processing }}
            style={[styles.primaryButton, processing ? styles.disabled : null]}
            disabled={processing}
            onPress={generateResult}
          >
            <Text style={styles.primaryText}>{processing ? "处理中…" : "生成简化房型"}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{result.name}</Text>
            <View style={styles.roomPreview}>
              <View style={styles.roomInner} />
            </View>
            <Text style={styles.resultMeta}>{result.width}m × {result.depth}m × {result.height}m · {result.source === "mock" ? "模拟扫描" : "户型图生成"}</Text>
            <TouchableOpacity
              accessibilityLabel={saved ? "扫描结果已保存到房源库" : processing ? "正在保存扫描结果" : "保存扫描结果到房源库"}
              accessibilityRole="button"
              accessibilityState={{ disabled: processing || saved }}
              style={[styles.saveButton, processing ? styles.disabled : null]}
              disabled={processing || saved}
              onPress={() => void saveResult()}
            >
              <Text style={styles.saveText}>{saved ? "已保存到 Library" : "保存到 Library"}</Text>
            </TouchableOpacity>
            {saved ? <Text accessibilityLiveRegion="polite" style={styles.savedStatus}>扫描结果已写入当前设备。</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DimensionField({
  accessibilityLabel,
  label,
  value,
  onChangeText
}: {
  accessibilityLabel: string;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        style={styles.input}
        value={value}
        keyboardType="decimal-pad"
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#f7f1e8", flex: 1 },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#fffaf2", borderRadius: 14, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  backText: { color: "#51483e", fontSize: 13, fontWeight: "900" },
  eyebrow: { color: "#7b6a55", fontSize: 12, fontWeight: "900", letterSpacing: 0.7, marginTop: 24 },
  title: { color: "#28231d", fontSize: 29, fontWeight: "900", marginTop: 6 },
  scopeNote: { color: "#745b39", fontSize: 13, lineHeight: 19, marginTop: 8 },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  modeButton: { alignItems: "center", backgroundColor: "#fffaf2", borderRadius: 15, flex: 1, justifyContent: "center", minHeight: 44, padding: 10 },
  modeButtonActive: { backgroundColor: "#2f2a22" },
  modeText: { color: "#5d5143", fontSize: 13, fontWeight: "900" },
  modeTextActive: { color: "#fff8ef" },
  formCard: { backgroundColor: "#fffaf2", borderRadius: 22, gap: 12, marginTop: 12, padding: 16 },
  fieldRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1 },
  label: { color: "#6c6155", fontSize: 12, fontWeight: "800", marginBottom: 6 },
  input: { backgroundColor: "#f3eadf", borderRadius: 13, color: "#2f2a22", fontSize: 17, fontWeight: "800", minHeight: 44, paddingHorizontal: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#2f2a22", borderRadius: 15, justifyContent: "center", minHeight: 48 },
  primaryText: { color: "#fff8ef", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  error: { backgroundColor: "#f3d8ce", borderRadius: 14, color: "#8e3f31", fontSize: 13, fontWeight: "800", marginTop: 12, padding: 12 },
  resultCard: { backgroundColor: "#fffaf2", borderRadius: 22, marginTop: 14, padding: 16 },
  resultTitle: { color: "#2f2a22", fontSize: 19, fontWeight: "900" },
  roomPreview: { alignItems: "center", backgroundColor: "#e9dfd2", borderRadius: 18, height: 160, justifyContent: "center", marginTop: 12 },
  roomInner: { backgroundColor: "#d3c1ab", borderColor: "#867660", borderLeftWidth: 8, borderTopWidth: 8, height: 92, transform: [{ rotate: "-8deg" }], width: 138 },
  resultMeta: { color: "#655b50", fontSize: 13, fontWeight: "800", marginTop: 10 },
  saveButton: { alignItems: "center", backgroundColor: "#31533d", borderRadius: 15, justifyContent: "center", marginTop: 12, minHeight: 48 },
  saveText: { color: "#f8fff8", fontSize: 14, fontWeight: "900" },
  savedStatus: { color: "#31533d", fontSize: 12, fontWeight: "800", marginTop: 8, textAlign: "center" }
});
