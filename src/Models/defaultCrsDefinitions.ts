export const defaultCrsDefinitions = [
  {
    crs: "EPSG:3857",
    name: "Web Mercator"
  },
  {
    crs: "EPSG:3031",
    name: "Antartica",
    projectedBounds: {
      min: { x: -2668275.0, y: -2294665.0 },
      max: { x: 2813725.0, y: 2362335.0 }
    },
    clipLayersToRectangle: false
  }
];
