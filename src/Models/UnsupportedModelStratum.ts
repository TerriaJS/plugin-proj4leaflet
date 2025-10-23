import { computed } from "mobx";
import {
  BaseModel,
  CatalogMemberMixin,
  CatalogMemberTraits,
  ViewerMode
} from "terriajs-plugin-api";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import { WorkbenchControls } from "terriajs/lib/ReactViews/Workbench/Controls/WorkbenchControls";
import { isCrsHandledByTerria } from "./Crs";
import PluginModel from "./PluginModel";

/**
 * Stratum for models that do not support the active projection
 */
export default class UnsupportedModelStratum extends LoadableStratum(
  CatalogMemberTraits
) {
  static stratumName = "proj4Leaflet-unsupportedModelStratum";

  readonly model: CatalogMemberMixin.Instance;
  readonly plugin: PluginModel;

  constructor(model: CatalogMemberMixin.Instance, plugin: PluginModel) {
    super();
    this.model = model;
    this.plugin = plugin;
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new UnsupportedModelStratum(
      newModel as CatalogMemberMixin.Instance,
      this.plugin
    ) as this;
  }

  static ensureStratum(
    model: CatalogMemberMixin.Instance,
    plugin: PluginModel
  ) {
    if (!model.strata.has(UnsupportedModelStratum.stratumName)) {
      model.strata.set(
        UnsupportedModelStratum.stratumName,
        new UnsupportedModelStratum(model, plugin)
      );
    }
  }

  static removeStratum(model: CatalogMemberMixin.Instance) {
    model.strata.delete(UnsupportedModelStratum.stratumName);
  }

  @computed
  get show() {
    if (!this.isMapUsingCustomCrs) return;
    return false;
  }

  @computed
  get shortReport() {
    if (!this.isMapUsingCustomCrs) return;

    const mapCrs = this.plugin.currentCrs;

    return `<b>⚠️ Invalid projection</b><p>This dataset does not support the current base map projection (${mapCrs}) and cannot be displayed. Select a <settingspanel title="Open Map Settings">supported base map</settingspanel> to view the dataset.</p>`;
  }

  @computed
  get workbenchControls(): Partial<WorkbenchControls> | undefined {
    if (!this.isMapUsingCustomCrs) return;

    // disable all workbench controls except short report and about data
    return {
      disableAll: true,
      shortReport: true,
      aboutData: true
    };
  }

  @computed
  private get isMapUsingCustomCrs(): boolean {
    return (
      this.plugin.terria.mainViewer.viewerMode === ViewerMode.Leaflet &&
      !isCrsHandledByTerria(this.plugin.currentCrs)
    );
  }
}

StratumOrder.addLoadStratum(UnsupportedModelStratum.stratumName);
