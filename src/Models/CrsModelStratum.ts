import { computed } from "mobx";
import proj4 from "proj4";
import { BaseModel, ViewerMode } from "terriajs-plugin-api";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import createStratumInstance from "terriajs/lib/Models/Definition/createStratumInstance";
import { RectangleTraits } from "terriajs/lib/Traits/TraitsClasses/MappableTraits";
import {
  CrsModel,
  CrsModelTraits,
  CustomCrsTilingSchemeName,
  isCrsHandledByTerria
} from "./Crs";
import PluginModel from "./PluginModel";

/**
 * Provides overrides for traits of a CrsModel
 *
 * Note that the implementation assumes that the stratum is removed from the
 * model when the plugin is disabled. We do not explicitly check the plugin
 * status here.
 */
export default class CrsModelStratum extends LoadableStratum(CrsModelTraits) {
  static stratumName = "customCrsModelStratum";

  readonly model: CrsModel;
  readonly plugin: PluginModel;

  constructor(model: CrsModel, plugin: PluginModel) {
    super();

    this.model = model;
    this.plugin = plugin;
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new CrsModelStratum(newModel as CrsModel, this.plugin) as this;
  }

  /**
   * Use custom tiling scheme generator
   */
  @computed
  get tilingSchemeGenerator() {
    return CustomCrsTilingSchemeName;
  }

  /**
   * The model CRS
   */
  @computed
  get crs(): string | undefined {
    // 1. If the main viewer is NOT in Leaflet mode, we let Terria decide what CRS to use
    // 2. Otherwise use the current custom CRS if the model supports it
    if (this.model.terria.mainViewer.viewerMode !== ViewerMode.Leaflet) return;
    return this.model.availableCrs.find(
      (crs) => crs === this.plugin.currentCrs
    );
  }

  /**
   * The CRS to use for preview map
   *
   * Why do we need to define `previewCrs` in addition to `crs`?
   *
   * The model `crs` value depends on the type of the main viewer and this
   * plugin's CRS setting. For eg, if the main viewer is Cesium, the `crs` will
   * fallback to Terria's default CRS (EPSG:3857|4326). If you were to then
   * preview any model, it will not show a valid preview if the model does not
   * support EPSG:3857. We use `previewCrs` to force a useful preview
   * indpendent of the main viewer state. The `PreviewViewer` also uses
   * `previewCrs` trait to draw a more accurate extent polygon for the model
   * preview.
   */
  @computed
  get previewCrs() {
    // Return current CRS if it is supported by the model
    const currentCrs = this.model.availableCrs.find(
      (crs) => crs === this.plugin.currentCrs
    );
    if (currentCrs) return currentCrs;

    // Otherwise return any model CRS that is supported by us
    const supportedCrs = this.plugin.allAvailableCrs.find((supportedCrs) =>
      this.model.availableCrs.find((modelCrs) => modelCrs === supportedCrs)
    );
    return supportedCrs;
  }

  /**
   * Preferred viewer mode
   *
   * Use 2D mode if the model is using a custom CRS.
   *
   * This is for eg used to switch the viewer to 2D mode when choosing a
   * basemap with custom CRS that can only be shown in 2D mode.
   */
  @computed
  get preferredViewerMode(): string | undefined {
    const crs = this.model.crs;
    const isCustomCrs = crs && !isCrsHandledByTerria(crs);
    return isCustomCrs ? "2d" : undefined;
  }

  /**
   * Whether to clip the model to its extent
   *
   * Imagery layers are clipped to its rectangle extent to avoid making
   * requests for tiles outside its defined extent. However, for some custom
   * CRS, bounds checking using 2 corner rectangle in lat/lon coordinates will
   * result in incorrect results skipping valid tiles (eg, polar
   * projections). We disable `clipToRectangle` for projections known to have
   * this problem. This can be configured in `crsDefinitions`.
   */
  @computed
  get clipToRectangle() {
    if (!this.plugin.enabled) return;

    const crs = this.model.crs;
    const definition = this.plugin.crsDefinitions.find(
      (def) => def.crs === crs
    );
    return definition?.clipLayersToRectangle;
  }

  /**
   * If `boundingBoxes` is available, use it to define a more accurate rectangle extent.
   *
   * Note that WMS defines a bounding in WGS84 coordinates which Terria uses by
   * default. But in my testing some services return a tighter bounding box in
   * native CRS. This `rectangle` definition gets used for example in default
   * ideal zoom and clipToRectangle - so the tighter the box the better.
   */
  @computed
  get rectangle() {
    const crs = this.model.crs;
    if (!crs) {
      return;
    }

    if (isCrsHandledByTerria(crs)) {
      // let terria handle this
      // there's some sensitivity around axis order which we're not handling below
      return undefined;
    }

    const customCrs = crs;
    const box = this.model.boundingBoxes.find((box) => box.crs === customCrs);
    if (!box?.min || !box?.max) {
      return;
    }

    const { x: minx, y: miny } = box.min;
    const { x: maxx, y: maxy } = box.max;
    if (
      minx === undefined ||
      miny === undefined ||
      maxx === undefined ||
      maxy == undefined
    ) {
      return;
    }

    let proj;
    try {
      proj = proj4(customCrs, "EPSG:4326");
    } catch {}

    if (!proj) return;

    const min = proj.forward({ x: minx, y: miny });
    const max = proj.forward({ x: maxx, y: maxy });

    return createStratumInstance(RectangleTraits, {
      west: min.x,
      south: min.y,
      east: max.x,
      north: max.y
    });
  }
}

StratumOrder.addLoadStratum(CrsModelStratum.stratumName);
