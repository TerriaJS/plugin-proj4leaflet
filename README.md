⚠️ WIP

A TerriaJS plugin using proj4leaflet library to implement custom projection support in Leaflet/2D mode.

It uses the [proj4leaflet](https://github.com/kartena/Proj4Leaflet) library.

### Setup

1. Add the plugin as dependency to your terriamap.

```bash
cd terriamap/
yarn add -W plugin-terriajs-proj4leaflet 
```

2. Register the plugin from `terriamap/plugins.ts`

``` bash
// terriamap/plugins.ts
const plugins: () => Promise<TerriaPluginModule>[] = () => [
  import("terriajs-plugin-proj4leaflet")
];
```

3. Configure available projections 

You can set the available projections using a configuration [similar to this one](https://gist.github.com/na9da/4497a551f90a0df18734bd640ad5f9d9#file-customproj-json-L2-L22).


