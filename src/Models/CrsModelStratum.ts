import { computed } from "mobx";
import proj4 from "proj4";
import { BaseModel, CatalogMemberMixin, ViewerMode } from "terriajs-plugin-api";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import createStratumInstance from "terriajs/lib/Models/Definition/createStratumInstance";
import { WorkbenchControls } from "terriajs/lib/ReactViews/Workbench/Controls/WorkbenchControls";
import { InfoSectionTraits } from "terriajs/lib/Traits/TraitsClasses/CatalogMemberTraits";
import {
  InitialMessageTraits,
  RectangleTraits
} from "terriajs/lib/Traits/TraitsClasses/MappableTraits";
import {
  CrsModel,
  CrsModelTraits,
  CustomCrsTilingSchemeName,
  isCrsHandledByTerria,
  isCrsModel
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
  static stratumName = "proj4leaflet-customCrsModelStratum";

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

  static ensureStratum(model: CrsModel, plugin: PluginModel) {
    if (!model.strata.has(CrsModelStratum.stratumName)) {
      model.strata.set(
        CrsModelStratum.stratumName,
        new CrsModelStratum(model, plugin)
      );
    }
  }

  static removeStratum(model: CrsModel) {
    model.strata.delete(CrsModelStratum.stratumName);
  }

  /**
   * Use custom tiling scheme generator
   */
  @computed
  get tilingSchemeGenerator() {
    return CustomCrsTilingSchemeName;
  }

  @computed
  private get is2dMode(): boolean {
    return this.model.terria.mainViewer.viewerMode === ViewerMode.Leaflet;
  }

  @computed
  private get isCompatibleMapCrs(): boolean {
    const modelCrs = this.model.crs;
    const mapCrs = this.plugin.currentCrs;
    return modelCrs === mapCrs;
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

  @computed
  get previewCaption() {
    const previewCrs = this.previewCrs;
    if (previewCrs) {
      const crsName = this.plugin.crsDefinitions.find(
        (def) => def.crs === previewCrs
      )?.name;
      const title = crsName ? `${crsName} (${previewCrs})` : previewCrs;
      return `Preview projection: ${title}`;
    }
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
    if (!this.is2dMode) return;

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

  @computed
  get initialMessage() {
    if (!this.is2dMode || this.isCompatibleMapCrs) return;

    const mapCrs = this.plugin.currentCrs;
    return createStratumInstance(InitialMessageTraits, {
      key: this.model.uniqueId,
      content: `One or more datasets were added that do not support the current base map projection (${mapCrs}) and cannot be displayed.`,
      showAsToast: true,
      toastVisibleDuration: 15
    });
  }

  @computed
  get shortReport() {
    if (!this.is2dMode || this.isCompatibleMapCrs) return;

    const mapCrs = this.plugin.currentCrs;
    return `<b>⚠️ Invalid projection</b><p>This dataset does not support the current base map projection (${mapCrs}) and cannot be displayed. Select a <settingspanel title="Open Map Settings">supported base map</settingspanel> to view the dataset.</p>`;
  }

  @computed
  get info() {
    if (!this.is2dMode) return;

    return [
      createStratumInstance(InfoSectionTraits, {
        name: "Map Settings (recommended)",
        content:
          "See below for the recommended Map Settings to support optimal viewing of this dataset. Other combinations may result in this dataset experiencing distortions or not displaying on the map.",
        contentAsObject: {
          "Map View": "2D",
          "Base Map(s)":
            this.compatibleBaseMapNames.join(", ") || "None available"
        }
      })
    ];
  }

  @computed
  private get compatibleBaseMapNames(): string[] {
    const allBaseMaps = this.model.terria.baseMapsModel.baseMapItems.map(
      (b) => b.item
    );
    const compatibleBaseMaps: string[] = [];

    for (let i = 0; i < allBaseMaps.length; i++) {
      const baseMap = allBaseMaps[i];
      if (
        isCrsModel(baseMap) &&
        baseMap.crs &&
        this.model.availableCrs.includes(baseMap.crs)
      ) {
        if (CatalogMemberMixin.isMixedInto(baseMap) && baseMap.name) {
          compatibleBaseMaps.push(`${baseMap.name} (${baseMap.crs})`);
        }
      }
    }

    return compatibleBaseMaps;
  }

  @computed
  get workbenchControls(): Partial<WorkbenchControls> | undefined {
    if (!this.is2dMode || this.isCompatibleMapCrs) return;

    return {
      disableAll: true,
      shortReport: true,
      aboutData: true
    };
  }
}

StratumOrder.addLoadStratum(CrsModelStratum.stratumName);
