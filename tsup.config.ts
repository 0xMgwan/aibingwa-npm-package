import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "esnext",
  outDir: "dist",
  splitting: false,
  bundle: false, // Don't bundle - preserve individual modules
  external: ["@coinbase/agentkit"],
});
