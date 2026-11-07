const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const zlib = require("zlib");
const devCerts = require("office-addin-dev-certs");

// Emits dict/sl.dawg.gz next to the word list so `http-server -g` can send it compressed
// (~6 MB -> ~2.6 MB on the wire).
class GzipDictionaryPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap("GzipDictionaryPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: "GzipDictionaryPlugin", stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER },
        (assets) => {
          const asset = assets["dict/sl.dawg"];
          if (!asset) return;
          const gz = zlib.gzipSync(asset.buffer(), { level: 9 });
          compilation.emitAsset("dict/sl.dawg.gz", new compiler.webpack.sources.RawSource(gz));
        }
      );
    });
  }
}

module.exports = async (env, argv) => {
  const isProd = argv.mode === "production";
  const https = isProd ? false : await devCerts.getHttpsServerOptions();

  return {
    entry: "./src/taskpane/taskpane.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "taskpane.js",
    },
    devServer: {
      static: path.join(__dirname, "dist"),
      server: https ? "https" : "http",
      port: 3000,
      ...(https && { https }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: "src/taskpane/taskpane.html", to: "taskpane.html" },
          { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
          { from: "assets", to: "assets", noErrorOnMissing: true },
          { from: "src/taskpane/dict/sl.dawg", to: "dict/sl.dawg" },
          {
            from: "src/taskpane/dict/custom.dic",
            to: "dict/custom.dic",
          },
        ],
      }),
      new GzipDictionaryPlugin(),
    ],
    performance: {
      // The word list is a large binary asset by design.
      assetFilter: (file) => !file.startsWith("dict/"),
    },
    resolve: {
      fallback: { buffer: false },
    },
  };
};
