import { computed } from "mobx";
import { BaseMapsModel } from "terriajs/lib/Models/BaseMaps/BaseMapsModel";
import LoadableStratum from "terriajs/lib/Models/Definition/LoadableStratum";
import { BaseModel } from "terriajs/lib/Models/Definition/Model";
import StratumOrder from "terriajs/lib/Models/Definition/StratumOrder";
import { BaseMapsTraits } from "terriajs/lib/Traits/TraitsClasses/BaseMapTraits";
import { isCrsHandledByTerria, isCrsModel } from "./Crs";

export default class BaseMapsStratum extends LoadableStratum(BaseMapsTraits) {
  static readonly stratumName = "proj4leaflet-customCrsBaseMapsStratum";

  readonly model: BaseMapsModel;

  constructor(model: BaseMapsModel) {
    super();
    this.model = model;
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new BaseMapsStratum(newModel as BaseMapsModel) as this;
  }

  /**
   * Shows a message next to the basemap selector in settings panel if the
   * chosen basemap has a custom CRS.
   */
  @computed
  get statusMessage() {
    const baseMap = this.model.terria.mainViewer.baseMap;
    const isCustomCrs =
      isCrsModel(baseMap) && baseMap.crs && !isCrsHandledByTerria(baseMap.crs);

    if (isCustomCrs) {
      return "⚠️ The selected base map can only be viewed in 2D";
    }
  }
}

StratumOrder.addLoadStratum(BaseMapsStratum.stratumName);
