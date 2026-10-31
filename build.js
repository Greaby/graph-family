const fs = require("fs");
const esbuild = require("esbuild");
const sass = require("sass");

const Generator = require("./src/generator/generator");

// Reload config.js on every build (useful in dev mode)
const load_config = () => {
    delete require.cache[require.resolve("./config")];
    return require("./config");
};

const build_assets = async (dist, dev) => {
    fs.mkdirSync(`${dist}/static`, { recursive: true });

    await esbuild.build({
        entryPoints: ["src/javascript/app.js"],
        bundle: true,
        minify: !dev,
        sourcemap: dev ? "inline" : false,
        format: "esm",
        splitting: true,
        target: ["es2022"],
        outdir: dist,
        entryNames: "[name]",
        chunkNames: "chunks/[name]-[hash]",
        logLevel: "warning",
    });

    const { css } = sass.compile("src/scss/app.scss", { style: dev ? "expanded" : "compressed" });
    fs.writeFileSync(`${dist}/app.css`, css);

    fs.cpSync("src/static", `${dist}/static`, { recursive: true });
};

// assets: false only regenerates the pages (when only the cards changed)
const build = async ({ dev = false, assets = true } = {}) => {
    const start = Date.now();
    const config = load_config();

    const generator = new Generator({ ...config, dev });
    generator.generate();

    if (assets) {
        fs.rmSync(`${config.folders.dist}/chunks`, { recursive: true, force: true });
        await build_assets(config.folders.dist, dev);
    }

    console.log(`✔ Site généré dans ${config.folders.dist}/ en ${Date.now() - start} ms`);
    return generator;
};

module.exports = build;

if (require.main === module) {
    build().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
