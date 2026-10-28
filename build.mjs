import { build } from "esbuild";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, "package/contents/ui/generated");
const checkMode = process.argv.includes("--check");
const target = checkMode ? join(root, ".build-check") : outdir;

if (checkMode)
    await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

await build({
    entryPoints: {
        ConfigPage: join(root, "src/qml/ConfigPage.ts"),
        HaRest: join(root, "src/qml/HaRest.ts"),
        PresetSync: join(root, "src/qml/PresetSync.ts"),
        HaSocket: join(root, "src/qml/HaSocket.ts"),
        ControlMath: join(root, "src/qml/ControlMath.ts"),
        PanelSession: join(root, "src/qml/PanelSession.ts"),
    },
    outdir: target,
    bundle: true,
    format: "esm",
    target: "es2016",
    outExtension: { ".js": ".mjs" },
    minify: false,
    legalComments: "none",
    logLevel: "info",
});

const files = (await readdir(target)).sort();

for (const file of files) {
    const text = await readFile(join(target, file), "utf8");
    const specifiers = [];
    for (const match of text.matchAll(/\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm))
        specifiers.push(match[1] || match[2]);
    const external = specifiers.filter((spec) => !spec.startsWith("./") && !spec.startsWith("../"));
    if (external.length > 0) {
        console.error(`${file}: bundle imports external modules: ${external.join(", ")}`);
        process.exit(1);
    }
}

if (checkMode) {
    const committed = (await readdir(outdir)).sort();
    const mismatch = [];
    for (const file of files) {
        if (!committed.includes(file)) {
            mismatch.push(`missing artifact: ${file}`);
            continue;
        }
        const fresh = await readFile(join(target, file), "utf8");
        const old = await readFile(join(outdir, file), "utf8");
        if (fresh !== old)
            mismatch.push(`outdated artifact: ${file}`);
    }
    for (const file of committed) {
        if (!files.includes(file))
            mismatch.push(`stale artifact: ${file}`);
    }
    await rm(target, { recursive: true, force: true });
    if (mismatch.length > 0) {
        for (const line of mismatch)
            console.error(line);
        console.error("Run 'pnpm run build' and commit the regenerated artifacts.");
        process.exit(1);
    }
    console.log("Generated artifacts are up to date.");
} else {
    console.log(`Built ${files.length} artifacts in ${outdir}`);
}
