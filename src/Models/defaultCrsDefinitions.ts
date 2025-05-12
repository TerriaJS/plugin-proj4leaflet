export const defaultCrsDefinitions = [
  {
    crs: "EPSG:3857",
    name: "Web Mercator"
  },
  {
    // preview map requires to be in zoom=0
    crs: "EPSG:3031",
    name: "Antartica",
    projectedBounds: {
      min: {
        x: -4194304,
        y: -4194304
      },
      max: {
        x: 4194304,
        y: 4194304
      }
    },
    clipLayersToRectangle: false
  }
  // {
  //   crs: "EPSG:28355",
  //   projectedBounds: {
  //     min: {
  //       x: -6445257.39,
  //       y: -2068741.81
  //     },
  //     max: {
  //       x: 3502694.93,
  //       y: 9063625.73
  //     }
  //   }
  // }
];
