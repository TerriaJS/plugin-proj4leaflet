import { useViewState } from "terriajs-plugin-api";
import PluginModel from "../Models/PluginModel";

export function usePlugin(): PluginModel | undefined {
  const terria = useViewState().terria;
  return terria.modelValues.find(
    (model) =>
      model instanceof PluginModel && model.uniqueId === PluginModel.type
  ) as PluginModel | undefined;
}
