import { runInAction } from "mobx";
import { CatalogMemberFactory, TerriaPlugin } from "terriajs-plugin-api";
import PluginModel from "./Models/PluginModel";
import { MapProjectionSelector } from "./Views/MapProjectionSelector";

const plugin: TerriaPlugin = {
  name: "proj4leaflet plugin",
  version: "0.0.1",
  description:
    "A TerriaJS plugin using proj4leaflet library to implement custom projection support in Leaflet/2D mode.",
  register: ({ viewState }) => {
    CatalogMemberFactory.register(PluginModel.type, PluginModel);
    runInAction(() => {
      viewState._customMapViewOptions = MapProjectionSelector;
    });
  }
};

export default plugin;
