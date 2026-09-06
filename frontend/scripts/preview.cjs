// Isolated demo preview. Normal build/start scripts retain real authentication.
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const frontend = path.resolve(__dirname, "..");
const mode = process.argv[2];
if (!["start", "build"].includes(mode)) {
  throw new Error("Expected start or build");
}
const env = {
  ...process.env,
  REACT_APP_PREVIEW: "true",
  REACT_APP_BACKEND_URL: "",
};
if (mode === "build") {
  // Matches static.directory in the repository's .openai/hosting.json.
  env.BUILD_PATH = path.resolve(frontend, "../build");
} else {
  // CRA uses environment variables rather than the preview service's Vite flags.
  const value = (flag, fallback) => {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  env.HOST = value("--host", "0.0.0.0");
  env.PORT = value("--port", "4173");
  env.BROWSER = "none";
}
const result = spawnSync(process.execPath,
  [require.resolve("@craco/craco/dist/bin/craco.js"), mode],
  { cwd: frontend, env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
