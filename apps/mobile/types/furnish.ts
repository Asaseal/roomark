export type Vector3Tuple = [number, number, number];

export type RoomMeshSource = "mock" | "roomplan" | "lidar" | "floorplan";

export type RoomMesh = {
  id: string;
  name: string;
  source: RoomMeshSource;
  width: number;
  depth: number;
  height: number;
  modelUri?: string;
  thumbnailUri?: string;
  capturedAt: string;
};

export type FurnitureCategory = "sofa" | "table" | "chair" | "bed" | "storage";

export type FurnitureAsset = {
  id: string;
  category: FurnitureCategory;
  name: string;
  description: string;
  modelUri: string;
  sourceModelUri?: string;
  thumbnailUri?: string;
  defaultScale: Vector3Tuple;
  footprint: {
    width: number;
    depth: number;
  };
};

export type PlacedFurniture = {
  id: string;
  assetId: string;
  category: FurnitureCategory;
  modelUri: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  locked: boolean;
  createdAt: string;
};

export type RenderJobStatus = "mock-ready" | "saved" | "failed";

export type RenderBasis = {
  roomSize: string;
  furnitureCount: number;
  style: string;
  layoutSummary: string;
};

export type RenderPreview = {
  id: string;
  roomId: string;
  status: RenderJobStatus;
  renderPrompt: string;
  basis: RenderBasis;
  summary: string;
  style: string;
  createdAt: string;
  savedAt?: string;
};

export type FurnishProject = {
  id: string;
  roomId: string;
  roomMesh: RoomMesh;
  placedFurniture: PlacedFurniture[];
  renderPreview?: RenderPreview;
  updatedAt: string;
  syncState: "local" | "pending" | "synced" | "failed";
};

export type FurnishSceneMessage =
  | {
      type: "SCENE_READY";
    }
  | {
      type: "PROJECT_CHANGED";
      project: FurnishProject;
    }
  | {
      type: "FURNITURE_SELECTED";
      furnitureId: string | null;
    }
  | {
      type: "SCENE_ERROR";
      message: string;
    }
  | {
      type: "SCENE_NOTICE";
      message: string;
    };

export type FurnishNativeMessage =
  | {
      type: "INIT_PROJECT";
      project: FurnishProject;
      assets: FurnitureAsset[];
    }
  | {
      type: "ADD_FURNITURE";
      asset: FurnitureAsset;
    }
  | {
      type: "LOCK_SELECTED";
    }
  | {
      type: "DELETE_SELECTED";
    }
  | {
      type: "RESET_CAMERA";
    };
