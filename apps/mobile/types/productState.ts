import type { PropertyRecord } from "./property";

export type ProductState = {
  schemaVersion: 1;
  propertiesById: Record<string, PropertyRecord>;
  comparisonIds: string[];
  selectedPropertyId?: string;
  updatedAt: string;
};
