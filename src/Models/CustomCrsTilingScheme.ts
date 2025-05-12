import L from "leaflet";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import MapProjection from "terriajs-cesium/Source/Core/MapProjection";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import { TerriaTilingScheme } from "terriajs/lib/Map/ImageryProvider/TilingSchemeGenerator";
import Model from "terriajs/lib/Models/Definition/Model";
import { CrsDefinitionTraits } from "./PluginModelTraits";
import { buildProjCrs } from "./buildProjCrs";

class CustomMapProjection implements MapProjection {
  constructor(readonly crs: L.Proj.CRS, readonly ellipsoid: Ellipsoid) {}

  // project from cartographic lat, lng to CRS local
  project(cartographic: Cartographic, result?: Cartesian3): Cartesian3 {
    const latLng = L.latLng(
      CesiumMath.toDegrees(cartographic.latitude),
      CesiumMath.toDegrees(cartographic.longitude)
    );
    const crsPoint = this.crs.project(latLng);
    result ??= new Cartesian3();
    result.x = crsPoint.x;
    result.y = crsPoint.y;
    result.z = 0;
    return result;
  }

  // Project from CRS local to cartographic lat lng
  unproject(cartesian: Cartesian3, result?: Cartographic): Cartographic {
    const crsPoint = L.point(cartesian.x, cartesian.y);
    const latLng = this.crs.unproject(crsPoint);
    return Cartographic.fromDegrees(latLng.lng, latLng.lat, undefined, result);
  }
}

export default class CustomCrsTilingScheme implements TerriaTilingScheme {
  readonly ellipsoid: Ellipsoid;
  readonly projection: MapProjection;
  readonly rectangle: Rectangle;
  readonly tileSize: L.Point;
  readonly projCrs: L.Proj.CRS;
  readonly customCrs?: string;

  constructor(options: {
    crs: L.Proj.CRS;
    tileWidth: number;
    tileHeight: number;
    ellipsoid?: Ellipsoid;
  }) {
    this.projCrs = options.crs;
    this.customCrs = this.projCrs.code;
    this.ellipsoid = options?.ellipsoid ?? Ellipsoid.WGS84;
    this.projection = new CustomMapProjection(this.projCrs, this.ellipsoid);

    const bounds = this.projCrs.projection.bounds;
    if (bounds?.max && bounds?.min) {
      const southWest = this.projection.unproject(
        new Cartesian3(bounds.min.x, bounds.min.y)
      );
      const northEast = this.projection.unproject(
        new Cartesian3(bounds.max.x, bounds.max.y)
      );

      this.rectangle = new Rectangle(
        southWest.longitude,
        southWest.latitude,
        northEast.longitude,
        northEast.latitude
      );
    } else {
      this.rectangle = Rectangle.MAX_VALUE.clone();
    }

    this.tileSize = new L.Point(options.tileWidth, options.tileHeight);
  }

  static build(
    crs: string,
    crsDefinition?: Model<CrsDefinitionTraits>
  ): CustomCrsTilingScheme | undefined {
    const projCrs = buildProjCrs(crs, crsDefinition);
    return (
      projCrs &&
      new CustomCrsTilingScheme({
        crs: projCrs,
        tileWidth: 256,
        tileHeight: 256
      })
    );
  }

  private getNumberOfTilesAtLevel(level: number): L.Point {
    // get bounds in pixel space for the given zoom level
    const bounds = this.projCrs.getProjectedBounds(level);
    if (!bounds?.min || !bounds?.max) {
      return L.point([Infinity, Infinity]);
    }
    const tileRangeMin = bounds.min!.unscaleBy(this.tileSize);
    const tileRangeMax = bounds.max!.unscaleBy(this.tileSize);
    const tileCount = tileRangeMax.subtract(tileRangeMin);
    return tileCount;
  }

  getNumberOfXTilesAtLevel(level: number): number {
    return this.getNumberOfTilesAtLevel(level).x;
  }

  getNumberOfYTilesAtLevel(level: number): number {
    return this.getNumberOfTilesAtLevel(level).y;
  }

  /**
   * Convert rectangle extent in WGS84 to extent in native CRS
   */
  rectangleToNativeRectangle(
    rectangle: Rectangle,
    result?: Rectangle | undefined
  ): Rectangle {
    const projection = this.projection;
    const southwest = projection.project(Rectangle.southwest(rectangle));
    const northeast = projection.project(Rectangle.northeast(rectangle));

    result ??= new Rectangle();
    result.west = southwest.x;
    result.south = southwest.y;
    result.east = northeast.x;
    result.north = northeast.y;
    return result;
  }

  /**
   * Converts tile coordinates to rectangle extent in WGS84
   */
  tileXYToRectangle(
    x: number,
    y: number,
    level: number,
    result?: any
  ): Rectangle {
    const nativeRectangle = this.tileXYToNativeRectangle(x, y, level, result);

    const projection = this.projection;
    const southwest = projection.unproject(
      new Cartesian3(nativeRectangle.west, nativeRectangle.south)
    );
    const northeast = projection.unproject(
      new Cartesian3(nativeRectangle.east, nativeRectangle.north)
    );

    nativeRectangle.west = southwest.longitude;
    nativeRectangle.south = southwest.latitude;
    nativeRectangle.east = northeast.longitude;
    nativeRectangle.north = northeast.latitude;
    return nativeRectangle;
  }

  /**
   * Converts tile coordinates to rectangle extent in native CRS
   */
  tileXYToNativeRectangle(
    x: number,
    y: number,
    level: number,
    result?: Rectangle
  ) {
    // Calculate pixel coordinates from tile coordinates
    const nwPixelPoint = L.point(x, y).scaleBy(this.tileSize);
    const sePixelPoint = nwPixelPoint.add(this.tileSize);

    const crs = this.projCrs;

    // Compute lat lng for pixel coordinates
    const nwLatLng = crs.pointToLatLng(nwPixelPoint, level);
    const seLatLng = crs.pointToLatLng(sePixelPoint, level);

    // Convert lat lng to coordinates in CRS
    const nwCrsPoint = crs.project(nwLatLng);
    const seCrsPoint = crs.project(seLatLng);
    const bounds = L.bounds(nwCrsPoint, seCrsPoint);

    // Compute bounds
    const rectangle = result ?? new Rectangle();
    const min = bounds.getTopLeft();
    const max = bounds.getBottomRight();
    rectangle.west = round8(min.x);
    rectangle.south = round8(min.y);
    rectangle.east = round8(max.x);
    rectangle.north = round8(max.y);

    return rectangle;
  }

  positionToTileXY(
    position: Cartographic,
    level: number,
    result: Cartesian2
  ): Cartesian2 {
    const latLng = L.latLng(
      CesiumMath.toDegrees(position.latitude),
      CesiumMath.toDegrees(position.longitude)
    );
    // Convert to coordinate in native CRS
    const crsCoord = this.projCrs.latLngToPoint(latLng, level);
    result ??= new Cartesian2();
    result.x = Math.floor(crsCoord.x / this.tileSize.x);
    result.y = Math.floor(crsCoord.y / this.tileSize.y);
    return result;
  }
}

function round8(value: number): number {
  return Math.round(value * 100000000) / 100000000;
}
