import { computed, makeObservable, reaction, when } from "mobx";
import { fromPromise } from "mobx-utils";
import { CreateModel, ViewerMode } from "terriajs-plugin-api";
import TilingSchemeGenerator from "terriajs/lib/Map/ImageryProvider/TilingSchemeGenerator";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import {
  BaseModel,
  ModelConstructorParameters
} from "terriajs/lib/Models/Definition/Model";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import createStratumInstance from "terriajs/lib/Models/Definition/createStratumInstance";
import PreviewViewer from "terriajs/lib/ViewModels/PreviewViewer";
import TerriaViewer from "terriajs/lib/ViewModels/TerriaViewer";
import {
  CustomCrsTilingSchemeName,
  isCrsHandledByTerria,
  isCrsModel,
  isKnownCrs
} from "./Crs";
import CrsModelStratum from "./CrsModelStratum";
import PluginModelTraits, {
  BASEMAP_CRS,
  CrsDefinitionTraits
} from "./PluginModelTraits";
import { defaultCrsDefinitions } from "./defaultCrsDefinitions";

// Lazy load leafelt but keep alive
const leafletCrsPromise = computed(
  () => fromPromise(import("./LeafeltWithCrs")),
  {
    keepAlive: true
  }
);

const lazyLeafletCrs = () =>
  leafletCrsPromise
    .get()
    .case({ fulfilled: (mod) => mod, pending: () => undefined });

/**
 * The plugin instance
 */
export default class PluginModel extends CreateModel(PluginModelTraits) {
  static readonly type = "customProjections";
  readonly type = PluginModel.type;

  constructor(...args: ModelConstructorParameters) {
    super(...args);
    makeObservable(this);

    if (this.uniqueId === PluginModel.type) {
      this.setup();
    } else {
      console.error(
        `Ignoring custom projections configuration with ID "${this.uniqueId}". Only configuration with ID "${this.type}" are used.`
      );
    }
  }

  /**
   * Setup overrides (only when the plugin is enabled)
   *
   * Note that we don't currently destroy the setup once the plugin has been enabled!
   */
  private setup() {
    when(
      () => this.enabled === true,
      () => {
        this.strata.set(
          PluginDefaultStratum.stratumName,
          new PluginDefaultStratum(this)
        );
        this.registerTilingSchemeGenerator();
        this.overrideLeafletViewer();
        this.overrideCrsModels();
      }
    );
  }

  /**
   * Register our custom tiling scheme generator
   */
  private registerTilingSchemeGenerator() {
    TilingSchemeGenerator.register(CustomCrsTilingSchemeName, (crs) => {
      // Use the tiling scheme only if it is a custom CRS that we support
      if (
        !crs ||
        isCrsHandledByTerria(crs) ||
        !this.allAvailableCrs.includes(crs)
      ) {
        return;
      }

      // Build the tiling scheme for the custom CRS
      const definition = this.crsDefinitions.find((def) => def.crs === crs);
      return lazyLeafletCrs()?.CustomCrsTilingScheme.build(crs, definition);
    });
  }

  /**
   * Override standard Terria Leaflet viewer if the plugin is enabled and the
   * current CRS is a custom CRS.
   */
  private overrideLeafletViewer() {
    const originalLoader = TerriaViewer.Loaders[ViewerMode.Leaflet];
    TerriaViewer.Loaders[ViewerMode.Leaflet] = async (terriaViewer) => {
      const originalPromise = originalLoader(terriaViewer);
      if (!this.enabled) {
        return originalPromise;
      }

      let mapCrs: string | undefined;
      if (terriaViewer instanceof PreviewViewer) {
        // If this is a preview viewer use the CRS of the previewed item as the map CRS.
        if (isCrsModel(terriaViewer.previewed)) {
          mapCrs = terriaViewer.previewed.previewCrs;
        }
      } else {
        mapCrs = this.currentCrs;
      }

      const { leafletWithCrs, buildProjCrs } = await leafletCrsPromise.get();

      const projCrs =
        mapCrs && !isCrsHandledByTerria(mapCrs)
          ? buildProjCrs(
              mapCrs,
              this.crsDefinitions.find((def) => def.crs === mapCrs)
            )
          : undefined;

      if (!projCrs) {
        return originalPromise;
      }

      return originalPromise.then((Leaflet) => {
        return leafletWithCrs(
          Leaflet,
          projCrs,
          this.crsDefinitions.find((def) => def.crs === mapCrs)
        );
      });
    };
  }

  /**
   * Add override stratum for models that have CrsTraits
   */
  private overrideCrsModels() {
    return reaction(
      () => this.terria.modelValues,
      (models) => {
        models.forEach((model) => {
          if (isCrsModel(model)) {
            if (this.enabled) {
              // Add stratum to model if it does not exist
              if (!model.strata.has(CrsModelStratum.stratumName)) {
                model.strata.set(
                  CrsModelStratum.stratumName,
                  new CrsModelStratum(model, this)
                );
              }
            } else {
              // Remove stratum if plugin is disabled
              if (model.strata.has(CrsModelStratum.name)) {
                model.strata.delete(CrsModelStratum.stratumName);
              }
            }
          }
        });
      },
      { fireImmediately: true }
    );
  }

  @computed
  get allAvailableCrs(): string[] {
    return [...this.availableCrs, "EPSG:3857"].filter(isKnownCrs);
  }

  /**
   * The CRS to use in 2D mode
   */
  @computed
  get currentCrs(): string {
    const crs =
      this.selectedCrs === BASEMAP_CRS ? this.baseMapCrs : this.selectedCrs;
    return crs && this.allAvailableCrs.includes(crs) && isKnownCrs(crs)
      ? crs
      : "EPSG:3857";
  }

  @computed
  private get baseMapCrs(): string | undefined {
    return isCrsModel(this.terria.mainViewer.baseMap)
      ? this.terria.mainViewer.baseMap.crs
      : isCrsModel(this.terria.mainViewer.loadingBaseMap)
      ? this.terria.mainViewer.loadingBaseMap.crs
      : undefined;
  }
}

class PluginDefaultStratum extends LoadableStratum(PluginModelTraits) {
  static readonly stratumName = "proj4leafletPluginDefaultStratum";

  readonly model: PluginModel;

  constructor(model: PluginModel) {
    super();
    this.model = model;
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new PluginDefaultStratum(model as PluginModel) as this;
  }

  /**
   * Load default crs definitions
   */
  @computed
  get crsDefinitions() {
    return defaultCrsDefinitions.map((def) =>
      createStratumInstance(CrsDefinitionTraits, def)
    );
  }
}

StratumOrder.addLoadStratum(PluginDefaultStratum.stratumName);
