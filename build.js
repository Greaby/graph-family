const fs = require("fs");
const esbuild = require("esbuild");
const sass = require("sass");

const config = require("./config");
const Generator = require("./src/generator/generator");

const dist = config.folders.dist;

const build_assets = async () => {
    fs.mkdirSync(`${dist}/static`, { recursive: true });

    await esbuild.build({
        entryPoints: ["src/javascript/app.js"],
        bundle: true,
        minify: true,
        format: "esm",
        target: ["es2022"],
        outfile: `${dist}/app.js`,
    });

    const { css } = sass.compile("src/scss/app.scss", { style: "compressed" });
    fs.writeFileSync(`${dist}/app.css`, css);

    fs.cpSync("src/static", `${dist}/static`, { recursive: true });
};

const build = async () => {
    const start = Date.now();
    new Generator(config).generate();
    await build_assets();
    console.log(`✔ Site généré dans ${dist}/ en ${Date.now() - start} ms`);
};

build().catch((error) => {
    console.error(error);
    process.exit(1);
});
