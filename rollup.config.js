import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es"
  },

  external: (dep) => {
    // From node_modules, only include proj4leaflet. This is to ensure that
    // proj4leaflet will use the same proj4 instance as terria
    // TODO: find a better way to do this!
    if (
      /node_modules/.test(dep) &&
      !/tslib.es6.js|(proj4leaflet\.js)/.test(dep)
    ) {
      return true;
    }
  },

  plugins: [
    // for importing proj4leaflet from node_modules
    nodeResolve(),

    // commonjs is required for correctly importing proj4leaflet
    commonjs(),

    typescript()
  ]
};
