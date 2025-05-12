import L from "leaflet";
import "proj4leaflet";
import { isCrsHandledByTerria } from "./Crs";
import { parseBounds } from "./bounds";

interface Options {
  proj4Definition?: string;
  projectedBounds?: {
    min?: { x?: number; y?: number };
    max?: { x?: number; y?: number };
  };
  resolutions: readonly number[];
}

/**
 * Build an instance of L.Proj.CRS for the given CRS
 *
 * @param crs The EPSG code
 * @param options CRS options
 * @returns An L.Proj.CRS instance or undefined if not enough information is
 *  available to create the projection
 */
export function buildProjCrs(
  crs: string,
  options?: Options
): L.Proj.CRS | undefined {
  if (isCrsHandledByTerria(crs)) {
    return;
  }

  const { proj4Definition, projectedBounds, resolutions } = options ?? {};
  const bounds = parseBounds(projectedBounds);
  const origin =
    bounds?.min && bounds?.max
      ? ([bounds.min.x, bounds.max.y] as [number, number])
      : undefined;

  let projCrs;
  try {
    projCrs = new L.Proj.CRS(crs, proj4Definition ?? "", {
      bounds,
      origin,
      resolutions: resolutions ? [...resolutions] : undefined
    });
  } catch (error) {
    console.log(error);
    console.error(`Failed to create CRS for code: ${crs}`);
    return;
  }

  if (!resolutions) {
    // proj4leaflet derives scale and zoom functions from the given resolutions
    //
    // However for most projections with scales that differ by a factor of 2 we
    // can compute this automatically if the resolutions array is not specified.
    //
    // If this doesn't work for your projection, try defining resolutions array in config
    if (bounds) {
      // when the CRS is not infinite, compute scale and zoom from the known bounds
      const size = bounds.getSize();
      // The resolution at zoom = 0 assuming map tiling scheme width 256
      const resZoom0 = Math.max(size.x, size.y) / 256;
      // Convert zoom to scale
      projCrs.scale = (zoom) => 1 / (resZoom0 / Math.pow(2, zoom));
      // Inverse of scale function
      projCrs.zoom = (scale) => Math.log2(scale * resZoom0);
    } else {
      // CRS has no known bounds - we have an infinite map
      // assume resolution at zoom level 0 = 256px
      projCrs.scale = (zoom) => 1 / (256 / Math.pow(2, zoom));
      // Inverse of scale function
      projCrs.zoom = (scale) => Math.log2(scale * 256);
    }
  }
  return projCrs;
}
