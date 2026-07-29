export type MapFilter = "all" | "visited" | "scanned" | "high-risk" | "favorite";

type MapProperty = {
  latitude: number;
  longitude: number;
  hasVisited: boolean;
  hasScan: boolean;
  isFavorite: boolean;
  highRiskCount: number;
};

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export function createMapBounds(properties: Pick<MapProperty, "latitude" | "longitude">[]): MapBounds {
  const latitudes = properties.map((property) => property.latitude);
  const longitudes = properties.map((property) => property.longitude);
  const north = Math.max(...latitudes, 31.24);
  const south = Math.min(...latitudes, 31.22);
  const east = Math.max(...longitudes, 121.49);
  const west = Math.min(...longitudes, 121.45);

  return {
    north: north + 0.005,
    south: south - 0.005,
    east: east + 0.005,
    west: west - 0.005
  };
}

export function projectProperty(property: Pick<MapProperty, "latitude" | "longitude">, bounds: MapBounds) {
  const rawX = ((property.longitude - bounds.west) / (bounds.east - bounds.west)) * 100;
  const rawY = ((bounds.north - property.latitude) / (bounds.north - bounds.south)) * 100;

  return {
    x: Math.min(94, Math.max(6, rawX)),
    y: Math.min(94, Math.max(6, rawY))
  };
}

export function filterProperties<T extends MapProperty>(properties: T[], filter: MapFilter): T[] {
  if (filter === "visited") {
    return properties.filter((property) => property.hasVisited);
  }
  if (filter === "scanned") {
    return properties.filter((property) => property.hasScan);
  }
  if (filter === "high-risk") {
    return properties.filter((property) => property.highRiskCount > 0);
  }
  if (filter === "favorite") {
    return properties.filter((property) => property.isFavorite);
  }
  return properties;
}
