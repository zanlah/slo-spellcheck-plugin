const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

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
          {
            from: path.join(__dirname, "node_modules", "dictionary-sl"),
            to: "dict",
            globOptions: { ignore: ["**/package.json", "**/*.js"] },
          },
        ],
      }),
    ],
    resolve: {
      fallback: { buffer: false },
    },
  };
};
