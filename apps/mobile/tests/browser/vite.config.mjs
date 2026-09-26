import path from "node:path";
import { fileURLToPath } from "node:url";
const mobileUrl =
  process.env.PASSPORT_TEST_MOBILE_URL || "http://localhost:5174";
const root = path.dirname(fileURLToPath(import.meta.url));
export default {
  root,
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: path.join(
          root,
          "node_modules/react-native-web/dist/index.js",
        ),
      },
      {
        find: /^react$/,
        replacement: path.join(root, "node_modules/react/index.js"),
      },
      {
        find: /^react\/(.*)$/,
        replacement: path.join(root, "node_modules/react/$1"),
      },
      {
        find: /^expo-(secure-store|local-authentication|status-bar|image-picker|file-system\/legacy)$/,
        replacement: path.join(root, "native-test-stubs.js"),
      },
    ],
  },
  define: {
    __DEV__: true,
    "process.env.EXPO_PUBLIC_API_URL": JSON.stringify(mobileUrl),
  },
  server: {
    host: "127.0.0.1",
    port: Number(new URL(mobileUrl).port) || 5174,
    strictPort: true,
    fs: { allow: [path.resolve(root, "../../../..")] },
    proxy: { "/api": { target: "http://localhost:8080" } },
  },
};
