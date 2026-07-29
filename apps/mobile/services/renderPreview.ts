import type { FurnishProject, FurnitureCategory, PlacedFurniture, RenderPreview, RoomMesh } from "../types/furnish";

const categoryLabels: Record<FurnitureCategory, string> = {
  sofa: "沙发",
  table: "桌子",
  chair: "椅子",
  bed: "床",
  storage: "收纳柜"
};

function describeAxis(value: number, negativeLabel: string, centerLabel: string, positiveLabel: string) {
  if (value < -0.35) {
    return negativeLabel;
  }

  if (value > 0.35) {
    return positiveLabel;
  }

  return centerLabel;
}

function describeFurniturePosition(item: PlacedFurniture, roomMesh: RoomMesh) {
  const [x, , z] = item.position;
  const horizontal = describeAxis(x, "左侧", "中部", "右侧");
  const depth = describeAxis(z, "靠近后墙", "房间中段", "靠近入口");
  const xDistance = Math.abs((roomMesh.width / 2) - Math.abs(x)).toFixed(1);
  const zDistance = Math.abs((roomMesh.depth / 2) - Math.abs(z)).toFixed(1);
  return `${categoryLabels[item.category]}位于${horizontal}${depth}，距离侧墙约 ${xDistance}m，距离前后墙约 ${zDistance}m`;
}

function summarizeFurniture(project: FurnishProject) {
  if (project.placedFurniture.length === 0) {
    return "当前还没有摆放家具，生成一张保留通行动线的空房软装概念图。";
  }

  return project.placedFurniture.map((item) => describeFurniturePosition(item, project.roomMesh)).join("；");
}

export function buildRenderPrompt(project: FurnishProject) {
  const { roomMesh } = project;
  const furnitureSummary = summarizeFurniture(project);
  const furnitureCount = project.placedFurniture.length;

  return [
    "请基于以下结构化信息生成一张室内软装效果图。",
    `房间信息：${roomMesh.name}，尺寸 ${roomMesh.width}m × ${roomMesh.depth}m × ${roomMesh.height}m，保持原始硬装结构和门窗关系。`,
    `家具数量：${furnitureCount} 件。家具布局：${furnitureSummary}。`,
    "视觉风格：温暖、现代、适合租房小空间；浅木色、奶油色墙面、柔和自然光、低饱和布艺、干净收纳。",
    "构图要求：像家装设计公司交付给租客的室内效果图，视角自然，空间真实，保留清晰通行动线。",
    "负面约束：不要生成奢华大宅，不要改变房间尺寸，不要增加不存在的大型家具，不要遮挡窗户和主要通道。"
  ].join("\n");
}

export function buildRenderBasis(project: FurnishProject) {
  const { roomMesh } = project;

  return {
    roomSize: `${roomMesh.width}m × ${roomMesh.depth}m × ${roomMesh.height}m`,
    furnitureCount: project.placedFurniture.length,
    style: "温暖现代 · 租房小空间",
    layoutSummary: summarizeFurniture(project)
  };
}

export function buildRenderSummary(project: FurnishProject) {
  const count = project.placedFurniture.length;
  const furnitureText = count > 0 ? `已参考 ${count} 件已摆放家具` : "基于空房尺寸做软装概念";
  return `${project.roomMesh.name} · ${project.roomMesh.width}m × ${project.roomMesh.depth}m · ${furnitureText}，风格为温暖现代的小户型租房方案。`;
}

export function createMockRenderPreview(project: FurnishProject): RenderPreview {
  const now = new Date().toISOString();

  return {
    id: `render-${project.roomId}-${Date.now()}`,
    roomId: project.roomId,
    status: "mock-ready",
    renderPrompt: buildRenderPrompt(project),
    basis: buildRenderBasis(project),
    summary: buildRenderSummary(project),
    style: "温暖现代租房小空间",
    createdAt: now
  };
}
