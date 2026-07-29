import type { PropertyRecord } from "../types/property";

export const propertyCatalog: PropertyRecord[] = [
  {
    id: "room-default-3m-cube",
    title: "样例房型",
    roomMesh: {
      id: "room-default-3m-cube",
      name: "样例房型",
      source: "mock",
      width: 3,
      depth: 3,
      height: 3,
      thumbnailUri: "",
      capturedAt: "2026-06-04T10:00:00.000Z"
    },
    monthlyRent: "¥4,800",
    deposit: "押一付一",
    oneTimeFees: "中介费 ¥2,400",
    totalMoveInCost: "¥12,000",
    commuteMinutes: 32,
    commuteTime: "32 分钟",
    area: "9.0㎡",
    latitude: 31.2304,
    longitude: 121.4737,
    hasVisited: true,
    hasScan: true,
    isFavorite: false,
    recommendationTag: "风险较高",
    furnitureFit: "基础可住",
    compareLabel: "租金较低，但需要确认墙面和噪音。",
    decisionSummary: "适合短租或过渡居住，软装空间够用，但入住前需要确认墙面和夜间噪音。",
    riskSummary: "3 项待确认 / 1 项高风险",
    highRiskCount: 1,
    pendingCount: 3,
    inspection: [
      { label: "墙面发霉", status: "attention", note: "窗边有轻微水印，需复查" },
      { label: "漏水痕迹", status: "risk", note: "卫生间门口疑似返潮" },
      { label: "家具破损", status: "normal", note: "基础家具可用" },
      { label: "插座数量", status: "attention", note: "床边插座偏少" },
      { label: "水表电表读数", status: "normal", note: "现场读数已记录" },
      { label: "采光", status: "normal", note: "上午自然光充足" },
      { label: "噪音", status: "attention", note: "临街，需要夜间复测" },
      { label: "门锁 / 窗户状态", status: "normal", note: "门锁正常，窗户可闭合" }
    ]
  },
  {
    id: "room-two-bed-one-bath",
    title: "两居室 · 一卫",
    roomMesh: {
      id: "room-two-bed-one-bath",
      name: "两居室 · 一卫",
      source: "floorplan",
      width: 5.8,
      depth: 4.2,
      height: 2.9,
      thumbnailUri: "",
      capturedAt: "2026-06-03T15:30:00.000Z"
    },
    monthlyRent: "¥6,900",
    deposit: "押二付一",
    oneTimeFees: "物业杂费 ¥800",
    totalMoveInCost: "¥21,500",
    commuteMinutes: 46,
    commuteTime: "46 分钟",
    area: "24.4㎡",
    latitude: 31.2228,
    longitude: 121.455,
    hasVisited: true,
    hasScan: true,
    isFavorite: false,
    recommendationTag: "空间利用最好",
    furnitureFit: "很适合布置",
    compareLabel: "空间更完整，但总成本和通勤压力更高。",
    decisionSummary: "适合两人合租，收纳和功能区更完整，但押金与通勤成本需要纳入决策。",
    riskSummary: "2 项待确认 / 0 项高风险",
    highRiskCount: 0,
    pendingCount: 2,
    inspection: [
      { label: "墙面发霉", status: "normal", note: "未见明显发霉" },
      { label: "漏水痕迹", status: "normal", note: "厨卫未见明显水痕" },
      { label: "家具破损", status: "attention", note: "沙发和床垫偏旧" },
      { label: "插座数量", status: "normal", note: "客厅和卧室数量够用" },
      { label: "水表电表读数", status: "normal", note: "已拍照留存" },
      { label: "采光", status: "normal", note: "南向房间采光较好" },
      { label: "噪音", status: "attention", note: "楼道隔音一般" },
      { label: "门锁 / 窗户状态", status: "normal", note: "门锁顺畅，窗户密封较好" }
    ]
  },
  {
    id: "room-studio-sunlight",
    title: "南向一居 · 采光好",
    roomMesh: {
      id: "room-studio-sunlight",
      name: "南向一居 · 采光好",
      source: "floorplan",
      width: 4.6,
      depth: 3.8,
      height: 2.8,
      thumbnailUri: "",
      capturedAt: "2026-06-02T11:20:00.000Z"
    },
    monthlyRent: "¥5,600",
    deposit: "押一付一",
    oneTimeFees: "清洁费 ¥300",
    totalMoveInCost: "¥11,500",
    commuteMinutes: 24,
    commuteTime: "24 分钟",
    area: "17.5㎡",
    latitude: 31.238,
    longitude: 121.482,
    hasVisited: true,
    hasScan: true,
    isFavorite: true,
    recommendationTag: "最适合立即入住",
    furnitureFit: "动线顺畅",
    compareLabel: "通勤短、采光好、风险少，适合优先考虑。",
    decisionSummary: "综合通勤、采光和入住成本更均衡，是当前最适合立即入住的候选房源。",
    riskSummary: "1 项待确认 / 0 项高风险",
    highRiskCount: 0,
    pendingCount: 1,
    inspection: [
      { label: "墙面发霉", status: "normal", note: "墙面干净，无明显霉点" },
      { label: "漏水痕迹", status: "normal", note: "厨卫和窗边未见水痕" },
      { label: "家具破损", status: "attention", note: "书桌边角有磨损" },
      { label: "插座数量", status: "normal", note: "床边和桌边均有插座" },
      { label: "水表电表读数", status: "normal", note: "读数已记录，待交房核对" },
      { label: "采光", status: "normal", note: "南向采光稳定" },
      { label: "噪音", status: "normal", note: "远离主路，白天较安静" },
      { label: "门锁 / 窗户状态", status: "normal", note: "门锁和窗户状态正常" }
    ]
  }
];

export function findPropertyById(id: string): PropertyRecord | undefined {
  return propertyCatalog.find((property) => property.id === id);
}

export function validatePropertyCatalog(properties: PropertyRecord[]): void {
  const propertyIds = new Set<string>();

  for (const property of properties) {
    if (propertyIds.has(property.id)) {
      throw new Error(`duplicate property id: ${property.id}`);
    }
    propertyIds.add(property.id);

    if (property.roomMesh.width <= 0 || property.roomMesh.depth <= 0 || property.roomMesh.height <= 0) {
      throw new Error(`invalid room dimensions: ${property.id}`);
    }
    if (!Number.isFinite(property.latitude) || !Number.isFinite(property.longitude)) {
      throw new Error(`invalid property coordinates: ${property.id}`);
    }

    const highRiskCount = property.inspection.filter((item) => item.status === "risk").length;
    const pendingCount = property.inspection.filter((item) => item.status === "attention").length;
    if (property.highRiskCount !== highRiskCount) {
      throw new Error(`high risk count mismatch: ${property.id}`);
    }
    if (property.pendingCount !== pendingCount) {
      throw new Error(`pending count mismatch: ${property.id}`);
    }
  }
}

validatePropertyCatalog(propertyCatalog);
