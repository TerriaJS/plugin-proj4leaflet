import {
  BaseModel,
  CatalogMemberMixin,
  CatalogMemberTraits,
  ViewerMode
} from "terriajs-plugin-api";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import PluginModel from "./PluginModel";
import { computed } from "mobx";
import { isCrsHandledByTerria } from "./Crs";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";

export default class GenericModelStratum extends LoadableStratum(
  CatalogMemberTraits
) {
  static stratumName = "proj4Leaflet-genericModelStratum";

  readonly model: CatalogMemberMixin.Instance;
  readonly plugin: PluginModel;

  constructor(model: CatalogMemberMixin.Instance, plugin: PluginModel) {
    super();
    this.model = model;
    this.plugin = plugin;
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new GenericModelStratum(
      newModel as CatalogMemberMixin.Instance,
      this.plugin
    ) as this;
  }

  @computed
  get shortReport() {
    if (!this.isMapUsingCustomCrs) return;

    const mapCrs = this.plugin.currentCrs;

    return `<b>⚠️ Invalid projection</b><p>This dataset does not support the current base map projection (${mapCrs}) and cannot be displayed. Select a <terriatooltip title="supported base map">choose from Map Settings menu</terriatooltip> to view the dataset.</p>`;
  }

  @computed
  get disableZoomTo() {
    if (!this.isMapUsingCustomCrs) return;

    return true;
  }

  @computed
  get disableOpacityControl() {
    if (!this.isMapUsingCustomCrs) return;

    return true;
  }

  @computed
  get hideLegendInWorkbench() {
    if (!this.isMapUsingCustomCrs) return;

    return true;
  }

  @computed
  get disableSplitter() {
    if (!this.isMapUsingCustomCrs) return;

    return true;
  }

  @computed
  get show() {
    if (!this.isMapUsingCustomCrs) return;

    return false;
  }

  @computed
  private get isMapUsingCustomCrs(): boolean {
    return (
      this.plugin.terria.mainViewer.viewerMode === ViewerMode.Leaflet &&
      !isCrsHandledByTerria(this.plugin.currentCrs)
    );
  }
}

StratumOrder.addLoadStratum(GenericModelStratum.stratumName);
