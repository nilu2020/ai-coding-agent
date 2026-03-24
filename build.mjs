import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: false,
  minify: false,
  logLevel: "info",
  // pdfkit loads AFM font data via dynamic require; mark as is-a-module so
  // esbuild keeps require calls that can't be statically resolved
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Bundle complete: out/extension.js");
