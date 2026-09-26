import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Small test-only loader for the local, acyclic TypeScript modules used by pure unit tests. */
export function createTypeScriptLoader(typescript) {
  const compiled = new Map();
  const compiling = new Set();
  function moduleUrl(file) {
    const key = file.href;
    if (compiled.has(key)) return compiled.get(key);
    if (compiling.has(key))
      throw new Error(`Test loader does not support a cyclic import: ${key}`);
    compiling.add(key);
    let source = typescript.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: typescript.ModuleKind.ES2022,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText;
    source = source.replace(
      /(\bfrom\s+|\bimport\s*)["'](\.[^"']+)["']/g,
      (_, prefix, specifier) => {
        const url = new URL(specifier, file);
        const dependency = [
          url,
          new URL(url.href + ".ts"),
          new URL(url.href + ".tsx"),
          new URL(url.href + "/index.ts"),
        ].find(
          (candidate) =>
            existsSync(fileURLToPath(candidate)) &&
            statSync(fileURLToPath(candidate)).isFile(),
        );
        if (!dependency)
          throw new Error(`Missing test dependency: ${url.href}`);
        return prefix + JSON.stringify(moduleUrl(dependency));
      },
    );
    const url =
      "data:text/javascript;base64," + Buffer.from(source).toString("base64");
    compiled.set(key, url);
    compiling.delete(key);
    return url;
  }
  return (file) => import(moduleUrl(file));
}
