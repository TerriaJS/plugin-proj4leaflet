import {
  ModelTraits,
  objectArrayTrait,
  objectTrait,
  primitiveArrayTrait,
  primitiveTrait
} from "terriajs-plugin-api";

export const BASEMAP_CRS = "basemapcrs";

export class PointTraits extends ModelTraits {
  @primitiveTrait({
    type: "number",
    name: "X",
    description: "X coordinate"
  })
  x?: number;

  @primitiveTrait({
    type: "number",
    name: "Y",
    description: "Y coordinate"
  })
  y?: number;
}

export class ProjectedBoundsTraits extends ModelTraits {
  @objectTrait({
    type: PointTraits,
    name: "Min",
    description: "Minium point of the bounding box"
  })
  min?: PointTraits;

  @objectTrait({
    type: PointTraits,
    name: "Max",
    description: "Maximum point of the bounding box"
  })
  max?: PointTraits;
}

export class CrsDefinitionTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "CRS",
    description: "An EPSG code"
  })
  crs?: string;

  @primitiveTrait({
    type: "string",
    name: "Name",
    description: "An optional human readable name for the projection"
  })
  name?: string;

  @primitiveTrait({
    type: "string",
    name: "Proj4Definition",
    description:
      "Optional Proj4 definition string for the CRS. If not provided we try to look it up from proj4js-definitions library. The CRS is usable only if a valid proj4Defintion is available."
  })
  proj4Definition?: string;

  @objectTrait({
    type: ProjectedBoundsTraits,
    name: "Projected bounds",
    description: "The bounding box for this CRS in projected coordinates"
  })
  projectedBounds?: ProjectedBoundsTraits;

  @primitiveTrait({
    type: "number",
    name: "Resolutions",
    description:
      "Optional array of numbers that specify the resolution to use at each zoom level."
  })
  resolutions?: number[];

  @primitiveTrait({
    type: "boolean",
    name: "clipToRectangle",
    description:
      "Whether to clip layers using this CRS. Set this to false for polar stereographic projections like EPSG:3031 for which bounds checking fails."
  })
  clipLayersToRectangle?: boolean;

  @primitiveTrait({
    type: "string",
    name: "Preview basemap ID",
    description: "ID of the basemap to use in preview viewer for this CRS."
  })
  previewBaseMapId?: string;
}

export default class PluginModelTraits extends ModelTraits {
  @primitiveTrait({
    type: "boolean",
    name: "Enabled",
    description: "Plugin is enabled when set to true."
  })
  enabled?: boolean = false;

  @primitiveTrait({
    type: "string",
    name: "Selected CRS",
    description: `The CRS to use for Leaflet map. This can be an EPSG code (eg 'EPSG:3031') or the literal value '${BASEMAP_CRS}' which sets it to the CRS of the active basemap.`
  })
  selectedCrs?: string | undefined = BASEMAP_CRS;

  @objectArrayTrait({
    type: CrsDefinitionTraits,
    name: "CRS definitions",
    description: "Settings to use for CRS",
    idProperty: "crs"
  })
  crsDefinitions?: CrsDefinitionTraits[];

  @primitiveArrayTrait({
    type: "string",
    name: "Available CRS",
    description:
      "List of available CRS. When not specified, we show all supported CRS for items that get added to the workbench."
  })
  availableCrs?: string[];
}
