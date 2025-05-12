import { observer } from "mobx-react";
import { FC } from "react";
import ReactSelect from "react-select";
import styled, { useTheme } from "styled-components";
import {
  CommonStrata,
  Text,
  ViewerMode,
  useViewState
} from "terriajs-plugin-api";
import { isCrsHandledByTerria, isCrsModel } from "../Models/Crs";
import PluginModel from "../Models/PluginModel";
import { BASEMAP_CRS } from "../Models/PluginModelTraits";
import { usePlugin } from "./usePlugin";

export const MapProjectionSelector: FC<{}> = observer(() => {
  const mainViewer = useViewState().terria.mainViewer;
  const plugin = usePlugin();

  if (!plugin?.enabled) {
    return null;
  }

  const viewerMode = mainViewer.viewerMode;
  return (
    <Wrapper>
      {viewerMode === ViewerMode.Leaflet && (
        <LeafletProjectionSelector plugin={plugin} />
      )}
      {(viewerMode === ViewerMode.Leaflet ||
        viewerMode === ViewerMode.Cesium) && <BaseMapWarning plugin={plugin} />}
    </Wrapper>
  );
});

const LeafletProjectionSelector: FC<{ plugin: PluginModel }> = observer(
  ({ plugin }) => {
    const theme = useTheme();

    const crsLabel = (crs: string) => {
      const name = plugin.crsDefinitions.find((def) => def.crs === crs)?.name;
      return name ? `${name} (${crs})` : crs;
    };

    const options = [
      { label: "Use base map projection", value: BASEMAP_CRS },
      ...plugin.allAvailableCrs?.map((crs) => ({
        label: crsLabel(crs),
        value: crs
      }))
    ];

    const selectedValue = plugin.selectedCrs
      ? options.find((opt) => opt.value === plugin.selectedCrs)
      : undefined;

    const setCrs = (crs: string | undefined) =>
      plugin.setTrait(CommonStrata.user, "selectedCrs", crs ?? BASEMAP_CRS);

    return (
      <div>
        <Text as="label">2D Map Projection</Text>
        <ReactSelect
          styles={{
            control: (baseStyles) => ({
              ...baseStyles,
              borderColor: theme.darkLighter
            }),
            option: (baseStyles) => ({
              ...baseStyles,
              color: theme.textBlack
            })
          }}
          options={options}
          onChange={(opt) => setCrs(opt?.value)}
          value={selectedValue}
        />
      </div>
    );
  }
);

const BaseMapWarning: FC<{ plugin: PluginModel }> = observer(({ plugin }) => {
  const mainViewer = useViewState().terria.mainViewer;
  const viewerMode = mainViewer.viewerMode;
  const baseMapCrs = isCrsModel(mainViewer.baseMap)
    ? mainViewer.baseMap.crs
    : "EPSG:3857";

  const warnLeafletBaseMap =
    viewerMode === ViewerMode.Leaflet &&
    baseMapCrs &&
    baseMapCrs !== plugin.currentCrs;

  const warnCesiumBaseMap =
    viewerMode === ViewerMode.Cesium &&
    baseMapCrs &&
    !isCrsHandledByTerria(baseMapCrs);

  return (
    <>
      {warnLeafletBaseMap && (
        <Text small>
          The selected basemap may not display correctly because its projection
          ({baseMapCrs}) is different from the active map projection (
          {plugin.currentCrs}
          ). Please choose a different basemap or change the map projection.
        </Text>
      )}
      {warnCesiumBaseMap && (
        <Text small>
          The selected basemap may not display correctly in 3D mode because its
          projection ({baseMapCrs}) is different from the map projection
          (WGS84). Please choose a different basemap or switch to 2D mode.
        </Text>
      )}
    </>
  );
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  margin: 7px 0;
  gap: 7px 0;

  :empty {
    display: none;
  }
`;
