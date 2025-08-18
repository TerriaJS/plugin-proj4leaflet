import L from "leaflet";
import { action, computed, override } from "mobx";
import "proj4leaflet";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import { MappableMixin } from "terriajs-plugin-api/dist/Mixins";
import filterOutUndefined from "terriajs/lib/Core/filterOutUndefined";
import TilingSchemeGenerator from "terriajs/lib/Map/ImageryProvider/TilingSchemeGenerator";
import { ImageryParts } from "terriajs/lib/ModelMixins/MappableMixin";
import CameraView from "terriajs/lib/Models/CameraView";
import type Leaflet from "terriajs/lib/Models/Leaflet";
import PreviewViewer from "terriajs/lib/ViewModels/PreviewViewer";
import type TerriaViewer from "terriajs/lib/ViewModels/TerriaViewer";
import { isCrsModel } from "./Crs";
import { compareBounds, parseBounds } from "./bounds";

export { default as CustomCrsTilingScheme } from "./CustomCrsTilingScheme";
export { buildProjCrs } from "./buildProjCrs";

interface Options {
  previewBaseMapId?: string;
}

/**
 * Returns a custom Leaflet implementation for the given CRS.
 *
 * There are some further differences depending on whether the map is part of
 * PreviewViewer or not.
 *
 *    - For all viewers, we override `doZoomTo` to divert zoom to homeCamera to zoom
 *      to the map CRS extent instead.
 *    - If PreviewViewer, we override `availableCatalogItems` to include a
 *      preview basemap defined for the CRS.
 *    - If PreviewViewer, we override _makeImageryLayerFromParts to replace the
 *      default imageryProvider with a previewImageryProvider that has the same
 *      CRS as the preview map.
 */
export function leafletWithCrs(
  LeafletBase: typeof Leaflet,
  crs: L.Proj.CRS,
  options: Options | undefined
): typeof Leaflet {
  class LeafletWithCrs extends LeafletBase {
    constructor(
      terriaViewer: TerriaViewer,
      container: string | HTMLElement,
      initOptions?: { mapOptions?: L.MapOptions }
    ) {
      super(terriaViewer, container, {
        ...initOptions,
        mapOptions: {
          ...initOptions?.mapOptions,
          crs
        }
      });

      this.patchFlyTo();
      this.setupMaxBounds();
    }

    /**
     * Override with additional catalog items
     *
     * If preview viewer, we add the preview basemap defined in `crsDefinition`
     */
    @override
    get availableCatalogItems() {
      const isPreviewViewer = this.terriaViewer instanceof PreviewViewer;
      return isPreviewViewer
        ? filterOutUndefined([
            ...super.availableCatalogItems,
            this.previewBaseMap
          ])
        : super.availableCatalogItems;
    }

    /**
     * Returns the preview basemap for this CRS if defined
     */
    @computed
    get previewBaseMap(): MappableMixin.Instance | undefined {
      if (!options?.previewBaseMapId) {
        return;
      }

      const mapCrs = crs.code;
      const previewBaseMap = this.terria.baseMapsModel.baseMapItems.find(
        (it) =>
          it.item.uniqueId === options.previewBaseMapId &&
          isCrsModel(it.item) &&
          it.item.crs === mapCrs
      )?.item;

      // load the basemap - not recommended to do inside a computed!
      previewBaseMap?.loadMapItems();
      return previewBaseMap;
    }

    /**
     * Setup map max bounds
     *
     * For a sane UX we set max bounds for the map so that panning and zooming
     * outside the valid extent will bring it back in view.
     */
    private setupMaxBounds() {
      if (crs.projection.bounds) {
        // If the projection has known bounds, use it to set the max map
        // bounds. Easy, we don't have to dynamically update the bounds when
        // layers are added/removed.
        this.setMaxBounds(crs.projection.bounds, crs);
      } else {
        // Update once first, then update each time a layer gets added or removed
        this.updateMaxBounds(this.itemBounds, crs);
        this.map.whenReady(() => {
          // We have an unbounded CRS (infinite extent)
          // For a sane UX we need to limit the bounds of the map. We do this by
          // dynamically updating the map bounds from known data set bounds.
          //
          // For infinite CRS, minZoom for layers have to be set to a negative
          // value. Layer minzoom update needs to happen after the layer has
          // been added or removed. So use leaflet events instead of mobx
          // reaction() to update the bounds.
          this.map
            .on(
              "layeradd",
              action(() => this.updateMaxBounds(this.itemBounds, crs))
            )
            .on(
              "layerremove",
              action(() => this.updateMaxBounds(this.itemBounds, crs))
            );
        });
      }
    }

    /**
     * Gets the combined bounds of all catalog items rendered by this viewer
     */
    @computed({ equals: compareBounds })
    private get itemBounds(): L.Bounds | undefined {
      const crsCode = crs.code;
      if (!crsCode) {
        return;
      }

      const getItemBounds = (
        item: MappableMixin.Instance
      ): L.Bounds | undefined => {
        return isCrsModel(item)
          ? parseBounds(item.boundingBoxes.find((box) => box.crs === crsCode))
          : undefined;
      };

      let combinedBounds: L.Bounds | undefined;

      // If this is a previewViewer then explicitly add the bounds of the
      // previewed item
      combinedBounds = this.previewedItem
        ? getItemBounds(this.previewedItem)
        : undefined;

      for (let item of this.availableCatalogItems) {
        if (!isCrsModel(item) || !item.show || item.crs !== crsCode) {
          continue;
        }

        const itemBounds = getItemBounds(item);
        if (!itemBounds) {
          continue;
        }

        combinedBounds = combinedBounds
          ? combinedBounds.extend(itemBounds)
          : itemBounds;
      }

      return combinedBounds;
    }

    @computed
    private get previewedItem(): MappableMixin.Instance | undefined {
      return this.terriaViewer instanceof PreviewViewer
        ? this.terriaViewer.previewed
        : undefined;
    }

    /**
     * Set the map's max bounds
     */
    private setMaxBounds(newBounds: L.Bounds | undefined, crs: L.Proj.CRS) {
      const map = this.map;
      if (!newBounds) {
        map.setMaxBounds(undefined);
        return;
      }

      const latLngBounds = toLatLngBounds(newBounds, crs);
      map.setMaxBounds(latLngBounds);
      if (!latLngBounds) {
        return;
      }

      // Call fit bounds if the current view is outside the new bounds. Eg,
      // user removes a layer resulting in a smaller extent that is outside the
      // current view, then calling fit bounds will adjust the view to be
      // within the new bounds. We do the comparison in native CRS as it is
      // more precise and avoids unecesarily shifting the view.
      const currentBounds = getCurrentNativeBounds(map);
      if (!currentBounds || !newBounds.contains(currentBounds)) {
        map.fitBounds(latLngBounds, { animate: false });
      }
    }

    /**
     * Update the max bounds and min zoom if required
     */
    private updateMaxBounds(bounds: L.Bounds | undefined, crs: L.Proj.CRS) {
      this.setMinZoomFromBounds(bounds, crs);
      this.setMaxBounds(bounds, crs);
    }

    /**
     * Set the minZoom for map and all layers from the bounds
     *
     * Why should we update minZoom?
     *
     */
    private setMinZoomFromBounds(
      bounds: L.Bounds | undefined,
      crs: L.Proj.CRS
    ) {
      let minZoom = 0;
      if (bounds?.min && bounds?.max) {
        const scaleAtZoom0 = crs.scale(0);
        const pixelMin = crs.transformation.transform(bounds.min, scaleAtZoom0);
        const pixelMax = crs.transformation.transform(bounds.max, scaleAtZoom0);
        const pixelExtent = pixelMax.subtract(pixelMin);
        const resolution = Math.max(
          Math.abs(pixelExtent.x),
          Math.abs(pixelExtent.y)
        );
        const scale = 1 / resolution;
        minZoom = Math.floor(crs.zoom(scale));
      }

      this.map.setMinZoom(minZoom);
      this.map.eachLayer((layer) => {
        if (layer.options) {
          if (
            layer instanceof L.TileLayer &&
            (layer.options.minNativeZoom === undefined ||
              layer.options.minZoom !== minZoom)
          ) {
            layer.options.minZoom = minZoom;
            layer.options.minNativeZoom ??= 0;
            (layer as any)._resetView?.();
          }
        }
      });
    }

    /**
     * Override zoomTo to fix homecamera zoom.
     *
     * Currently, we do not have a way to define CRS specific home camera.
     *
     * This is a hacky approach to override Terria's attempts to zoom to home
     * camera which may be far outside the CRS extent and instead zoom the CRS
     * extent.
     */
    async doZoomTo(target: any, flightDurationSeconds: number = 3.0) {
      if (
        target === this.terriaViewer.homeCamera &&
        this.map.options.maxBounds
      ) {
        // The homecamera from mainviewer may lie outside the current CRS
        // extent.  So we ignore it and zoom to our CRS extent. Ideally we
        // should check if the camera view rectangle lies completely within our
        // extent and then zoom to it. But this check may not always be
        // accurate when the cameraview 2 corner rectangle in WGS84
        // coordinates.
        this.map.flyToBounds(this.map.options.maxBounds, {
          animate: flightDurationSeconds > 0.0,
          duration: flightDurationSeconds
        });
      } else if (target instanceof CameraView && Array.isArray(target.extent)) {
        // Handle zoom to extent, where extent is a multipoint polygon. This is
        // the preferred way to zoom to share links as it is more precise than
        // 2 corner rectangle in lat/lon coordinates for extents that cross the
        // pole.

        const latLngs = target.extent.map((c) =>
          L.latLng(
            CesiumMath.toDegrees(c.latitude),
            CesiumMath.toDegrees(c.longitude)
          )
        );

        const pixelBounds = L.bounds(
          latLngs.map((ll) => this.map.project(ll, this.map.getZoom()))
        );

        const boundsSize = pixelBounds.getSize();
        const mapSize = this.map.getSize();
        const scale = Math.min(
          mapSize.x / boundsSize.x,
          mapSize.y / boundsSize.y
        );

        const newZoom = this.map.getScaleZoom(scale, this.map.getZoom());
        const newCenter = crs.unproject(
          L.bounds(latLngs.map((ll) => crs.project(ll))).getCenter()
        );

        this.map.flyTo(newCenter, newZoom, {
          animate: flightDurationSeconds > 0.0,
          duration: flightDurationSeconds
        });
      } else {
        return super.doZoomTo(target, flightDurationSeconds);
      }
    }

    /**
     * Override getCurrentCameraView to return the current view as a multipoint extent.
     *
     * To accurately describe extents that cross the pole in geographic
     * coordinates (lat/lon), we need at least 4 distinct points. This override
     * does that.
     */
    getCurrentCameraView(): CameraView {
      const initialView = this.getInitialView();
      if (initialView) {
        return initialView;
      }

      // Bounds in native CRS
      const bounds = getCurrentNativeBounds(this.map);
      const invalidBounds =
        !bounds ||
        !bounds.min ||
        !bounds.max ||
        [bounds.min?.x, bounds.min?.y, bounds.max?.x, bounds.max?.y].some(
          isNaN
        );
      if (invalidBounds) {
        return super.getCurrentCameraView();
      }

      // Corner points as lat/lon
      const cornersGeographic = [
        bounds.getBottomLeft(),
        bounds.getTopLeft(),
        bounds.getTopRight(),
        bounds.getBottomRight(),
        bounds.getBottomLeft()
      ].map((c) => {
        const latLng = crs.unproject(c);
        return Cartographic.fromDegrees(latLng.lng, latLng.lat);
      });

      return CameraView.fromExtent(cornersGeographic);
    }

    /**
     * Override _makeImageryLayerFromParts
     *
     * Discard layers with CRS that does not match the map CRS. For preview
     * viewer, we request a new imagery provider with a matching CRS and use it
     * if available.
     */
    _makeImageryLayerFromParts(
      parts: ImageryParts,
      item: MappableMixin.Instance
    ) {
      let imageryProvider = parts.imageryProvider;
      if (!imageryProvider) {
        return;
      }

      const tilingScheme = imageryProvider?.tilingScheme;
      const layerCrs =
        TilingSchemeGenerator.getCustomCrs(tilingScheme) ?? "EPSG:3857";

      const mapCrs = crs.code;
      if (layerCrs !== mapCrs) {
        // for preview viewer, if the layer crs is not the same as map crs,
        // request a new imagery provider with matching crs.
        const isPreviewViewer = this.terriaViewer instanceof PreviewViewer;
        if (isPreviewViewer) {
          let previewImageryProvider;
          if (isPreviewViewer) {
            previewImageryProvider =
              mapCrs && parts.previewImageryProvider?.(mapCrs);
          }

          if (!previewImageryProvider) {
            // ignore layer
            console.log(
              `Ignoring layer with CRS (${layerCrs}) that does not match map CRS (${mapCrs})`
            );
            return;
          }

          parts.imageryProvider = previewImageryProvider;
        } else {
          // ignore layer
          console.log(
            `Ignoring layer with CRS (${layerCrs}) that does not match map CRS (${mapCrs})`
          );
          return;
        }
      }

      const layer = super._makeImageryLayerFromParts(parts, item);
      if (layer instanceof L.TileLayer) {
        layer.options.minZoom = this.map.options.minZoom ?? 0;
      }

      return layer;
    }

    /**
     * Patch leaflet flyTo function.
     *
     * Turn off animation for infinite CRS to step around some leaflet
     * behaviour that sometimes crashes the map. We also avoid animation for
     * preview viewers which causes the imagery to bounce around a bit possibly
     * because of a small viewport (?)
     */
    private patchFlyTo() {
      const map = this.map;
      const isPreviewViewer = this.terriaViewer instanceof PreviewViewer;
      const originalFlyTo = map.flyTo.bind(map);

      map.flyTo = (latLng, zoom, options) => {
        if (zoom !== undefined && !isFinite(zoom)) {
          console.error(`Ignoring leaflet flyto call with infinite zoom`);
          return map;
        }

        const crs = map.options.crs;
        const animate =
          options?.animate === false
            ? false
            : crs?.infinite === true || isPreviewViewer
            ? false
            : true;

        try {
          originalFlyTo(latLng, zoom, {
            ...options,
            animate
          });
        } catch (error) {
          // Proj4 sometimes throws an error if the zoom to co-ordinates are
          // off the projection extent. Catch and ignore it to avoid crashing
          // the map.
          console.error(`Error when zooming leaflet map`, error);
        }

        return map;
      };
    }

    destroy() {
      this.map.off("layeradd");
      this.map.off("layerremove");
      super.destroy();
    }
  }

  return LeafletWithCrs;
}

/**
 * Convert L.Bounds in CRS coordinates to L.LatLngBounds in WGS84 coordinates
 */
function toLatLngBounds(
  bounds: L.Bounds | undefined,
  crs: L.Proj.CRS
): L.LatLngBounds | undefined {
  return bounds?.min && bounds?.max
    ? L.latLngBounds([crs.unproject(bounds.min), crs.unproject(bounds.max)])
    : undefined;
}

/**
 * Returns the bounds for the current map view in CRS native coordinates
 */
function getCurrentNativeBounds(map: L.Map): L.Bounds | undefined {
  const crs = map.options.crs;
  const transformation = (crs as any)?.transformation;
  if (!crs || !(transformation instanceof L.Transformation)) {
    return undefined;
  }

  // Get the current bounds in pixel coordinates and transform it to CRS coordinates
  const scale = crs.scale(map.getZoom());
  const pixelBounds = map.getPixelBounds();
  const sw = transformation.untransform(pixelBounds.getBottomLeft(), scale);
  const ne = transformation.untransform(pixelBounds.getTopRight(), scale);

  return new L.Bounds([sw, ne]);
}
