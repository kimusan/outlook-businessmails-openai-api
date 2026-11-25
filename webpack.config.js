/* eslint-disable no-undef */

const path = require("path");
const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { createDevProxyMiddleware } = require("./local-host/dev-proxy.cjs");

const urlDev = "https://localhost:3000/";

function normalizeBaseUrl(raw) {
  if (!raw) {
    return urlDev;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error(`Invalid ADDIN_BASE_URL "${raw}": it must be a valid http(s) URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid ADDIN_BASE_URL "${raw}": only http:// and https:// URLs are supported.`);
  }
  // Normalize to exactly one trailing slash so "https://ai.example.com" works like "https://ai.example.com/".
  return parsed.href.endsWith("/") ? parsed.href : parsed.href + "/";
}

const urlProd = normalizeBaseUrl(process.env.ADDIN_BASE_URL);

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  const taskpaneEntry = ["./src/taskpane/index.tsx", "./src/taskpane/taskpane.html"];
  // transpileOnly: type-checking is done separately via `npx tsc --noEmit`.
  // tsconfig targets es2017, so native async/await is emitted and the bundle
  // needs no runtime polyfill on Mailbox 1.3+ hosts (WebView2/Edge/web).
  const taskpaneLoaders = [
    {
      loader: "ts-loader",
      options: { transpileOnly: true },
    },
  ];

  if (dev) {
    taskpaneEntry.unshift("react-hot-loader/patch");
    taskpaneLoaders.unshift("react-hot-loader/webpack");
  }

  const config = {
    devtool: "source-map",
    entry: {
      taskpane: taskpaneEntry,
      resultDialog: "./src/dialog/resultDialog.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".html", ".js"],
      alias: {
        // The @fluentui/react "exports" map has no ThemeProvider subpath; point the
        // deep import at the CommonJS build so it shares modules with /lib/* imports.
        "@fluentui/react/lib/utilities/ThemeProvider": path.resolve(
          __dirname,
          "node_modules/@fluentui/react/lib-commonjs/utilities/ThemeProvider/index.js"
        ),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: taskpaneLoaders,
        },
        {
          test: /\.html$/,
          exclude: /node_modules/,
          use: "html-loader",
        },
        {
          test: /\.(png|jpg|jpeg|gif|ico)$/,
          type: "asset/resource",
          generator: {
            filename: "assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "manifest*.xml",
            to: "[name]" + "[ext]",
            transform(content) {
              if (dev) {
                return content;
              }
              // Replace the trailing-slash form first, then the bare form
              // (manifest.xml AppDomain has no trailing slash).
              return content
                .toString()
                .split(urlDev)
                .join(urlProd)
                .split(urlDev.replace(/\/$/, ""))
                .join(urlProd.replace(/\/$/, ""));
            },
          },
        ],
      }),
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "result-dialog.html",
        template: "./src/dialog/resultDialog.html",
        chunks: ["resultDialog"],
      }),
    ],
    devServer: {
      hot: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      // The add-in routes cross-origin AI traffic through POST /proxy/fetch on
      // its own origin (mirroring the packaged local host in sea-main.cjs).
      setupMiddlewares: (middlewares) => {
        middlewares.unshift(createDevProxyMiddleware());
        return middlewares;
      },
      server: {
        type: "https",
        options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await getHttpsOptions(),
      },
      port: process.env.npm_package_config_dev_server_port || 3000,
    },
  };

  return config;
};
