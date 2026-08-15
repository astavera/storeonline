/**
 * Registers TypeScript path aliases for Node-based maintenance scripts.
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const base = resolve(process.cwd(), "src", specifier.slice(2));
    const candidate = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]
      .find((path) => existsSync(path));
    if (!candidate) throw new Error(`Unable to resolve application module ${specifier}.`);
    return { shortCircuit: true, url: pathToFileURL(candidate).href };
  }
});
