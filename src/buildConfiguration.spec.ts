// @vitest-environment node
import { expect, it } from "vitest";
import { loadConfigFromFile, resolveConfig } from "vite";
import manifest from "../package.json";

// Catches npm build falling back to an adjacent legacy JS config and emitting
// root-relative assets instead of the Pages /schedule/ asset base. No build runs.
it("npm build resolves the TypeScript Pages config even when legacy JavaScript config exists", async () => {
  const viteCommand = manifest.scripts.build.split("&&").map(command => command.trim().split(/\s+/))
    .find(tokens => tokens[0] === "vite" && tokens[1] === "build");
  if (!viteCommand) throw new Error("package build script has no Vite build command");
  const configFlag = viteCommand.findIndex(token => token === "--config" || token === "-c");
  const configFile = configFlag === -1 ? undefined : viteCommand[configFlag + 1];

  const legacy = await loadConfigFromFile({ command: "build", mode: "production" }, "vite.config.js", undefined, "silent");
  expect(legacy?.path.replaceAll("\\", "/")).toMatch(/\/vite\.config\.js$/);
  // Vite's CLI forwards --config as configFile; resolve with the real installed
  // loader/plugins/defaults so omitting the flag reproduces actual discovery.
  const loaded = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
  expect.soft(loaded.configFile?.replaceAll("\\", "/")).toMatch(/\/vite\.config\.ts$/);
  expect(loaded.base).toBe("/schedule/");
});

// Catches preview discovering the legacy root-base config even though build
// emits /schedule/ assets. Resolves real preview config without starting a server.
it("npm preview resolves the same TypeScript Pages base as the production build", async () => {
  const viteCommand = manifest.scripts.preview.trim().split(/\s+/);
  if (viteCommand[0] !== "vite" || viteCommand[1] !== "preview") throw new Error("package preview script has no Vite preview command");
  const configFlag = viteCommand.findIndex(token => token === "--config" || token === "-c");
  const configFile = configFlag === -1 ? undefined : viteCommand[configFlag + 1];

  // These are the installed Vite preview entry point's actual resolution arguments.
  const loaded = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "production", "production", true);
  expect.soft(loaded.configFile?.replaceAll("\\", "/")).toMatch(/\/vite\.config\.ts$/);
  expect(loaded.base).toBe("/schedule/");
});
