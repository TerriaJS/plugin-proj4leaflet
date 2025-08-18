import proj4 from "proj4";
import extraProj4Definitions from "proj4js-definitions";
import {
  CatalogMemberTraits,
  MappableTraits,
  Model,
  mixTraits
} from "terriajs-plugin-api";
import hasTraits from "terriajs/lib/Models/Definition/hasTraits";
import CrsTraits, {
  SUPPORTED_CRS_3857,
  SUPPORTED_CRS_4326
} from "terriajs/lib/Traits/TraitsClasses/CrsTraits";
import ImageryProviderTraits from "terriajs/lib/Traits/TraitsClasses/ImageryProviderTraits";
import LegendOwnerTraits from "terriajs/lib/Traits/TraitsClasses/LegendOwnerTraits";

export const CustomCrsTilingSchemeName = "customCrsTilingScheme";

export type CrsModel = Model<CrsModelTraits>;

export class CrsModelTraits extends mixTraits(
  CrsTraits,
  MappableTraits,
  ImageryProviderTraits,
  CatalogMemberTraits,
  LegendOwnerTraits
) {}

export function isCrsModel(model: any): model is CrsModel {
  return (
    model &&
    hasTraits(model, CrsTraits, "crs") &&
    hasTraits(model, MappableTraits, "show")
  );
}

export const standardTerriaCrs = [...SUPPORTED_CRS_3857, ...SUPPORTED_CRS_4326];

export function isCrsHandledByTerria(crs: string): boolean {
  return standardTerriaCrs.includes(crs);
}

// This unfortunately has a side effect. Projections previously unknown to
// Terria will become known.
proj4.defs(extraProj4Definitions);

export function isKnownCrs(crs: string): boolean {
  return crs in proj4.defs;
}
