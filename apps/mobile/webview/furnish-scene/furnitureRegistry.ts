import type { FurnitureAsset } from "../../types/furnish";

export const furnitureAssets: FurnitureAsset[] = [
  {
    id: "sofa-soft-01",
    category: "sofa",
    name: "双人沙发",
    description: "约 1.55m 宽，适合小客厅或卧室角落。",
    modelUri: "D-glb/sofa.glb",
    defaultScale: [1, 1, 1],
    footprint: { width: 1.55, depth: 0.82 }
  },
  {
    id: "table-work-01",
    category: "table",
    name: "工作桌",
    description: "约 1.2m × 0.6m，用来检查通道余量。",
    modelUri: "D-glb/table.glb",
    defaultScale: [1, 1, 1],
    footprint: { width: 1.2, depth: 0.6 }
  },
  {
    id: "chair-daily-01",
    category: "chair",
    name: "餐椅 / 办公椅",
    description: "约 0.48m 宽，适合搭配桌面试摆。",
    modelUri: "D-glb/chair.glb",
    defaultScale: [1, 1, 1],
    footprint: { width: 0.48, depth: 0.52 }
  },
  {
    id: "bed-single-01",
    category: "bed",
    name: "单人床",
    description: "约 2m × 1m，快速判断卧室可住性。",
    modelUri: "D-glb/bed.glb",
    defaultScale: [1, 1, 1],
    footprint: { width: 1, depth: 2 }
  },
  {
    id: "storage-slim-01",
    category: "storage",
    name: "窄柜",
    description: "约 0.8m 宽，用于检查门后和墙边空间。",
    modelUri: "D-glb/storage.glb",
    defaultScale: [1, 1, 1],
    footprint: { width: 0.8, depth: 0.38 }
  }
];

export const furnitureCategoryLabels: Record<FurnitureAsset["category"], string> = {
  sofa: "沙发",
  table: "桌子",
  chair: "椅子",
  bed: "床",
  storage: "收纳"
};
