// Serveur de développement : sert le site, le régénère quand une fiche ou une
// source change, et permet d'ajouter des relations depuis le navigateur.
const fs = require("fs");
const path = require("path");
const http = require("http");

const build = require("../../build");
const { get_slug } = require("../generator/generator");
const add_relation = require("./card_writer");

const ROOT = path.join(__dirname, "../..");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
};

let generator = null;
const clients = new Set();

const broadcast = (event, data = {}) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((response) => response.write(message));
};

// Les builds sont mis en file : jamais deux en parallèle, et les demandes
// arrivées pendant un build sont regroupées en un seul build suivant
let running = Promise.resolve();
let queued = null;

const rebuild = ({ assets = true } = {}) => {
    if (queued) {
        queued.assets ||= assets;
        return queued.promise;
    }

    const next = { assets };
    next.promise = running.then(async () => {
        queued = null;
        try {
            generator = await build({ dev: true, assets: next.assets });
            broadcast("update");
        } catch (error) {
            console.error(error);
            broadcast("error", { message: error.message });
        }
    });

    queued = next;
    running = next.promise;
    return next.promise;
};

// Fichiers écrits par l'éditeur : leur build est déjà lancé par l'API
const written_by_api = new Map();

const watch = () => {
    let timeout = null;
    let assets = false;

    const on_change = (folder) => (_event, file) => {
        const full_path = path.join(ROOT, folder, file || "");
        if (Date.now() - (written_by_api.get(full_path) || 0) < 1000) return;

        assets ||= folder !== "data";
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            console.log(`↻ ${path.relative(ROOT, full_path)} modifié`);
            rebuild({ assets });
            assets = false;
        }, 100);
    };

    fs.watch(path.join(ROOT, "data"), { recursive: true }, on_change("data"));
    fs.watch(path.join(ROOT, "src"), { recursive: true }, on_change("src"));
    fs.watch(path.join(ROOT, "config.js"), on_change(""));
};

const read_json = (request) =>
    new Promise((resolve, reject) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 10_000) reject(new Error("Requête trop grande"));
        });
        request.on("end", () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error("JSON invalide"));
            }
        });
    });

const send_json = (response, status, data) => {
    response.writeHead(status, { "Content-Type": MIME_TYPES[".json"] });
    response.end(JSON.stringify(data));
};

// POST /__dev/relations { from, tag, to, note } : écrit la relation dans la fiche de `from`
const create_relation = async (request, response) => {
    const { from = "", tag = "", to = "", note = "" } = await read_json(request);
    const persons_folder = path.join(ROOT, generator.config.folders.persons);

    // Réutilise l'orthographe exacte d'une personne existante
    const canonical = (name) => generator.persons.get(get_slug(name))?.name ?? name.trim();
    const from_name = canonical(from);
    const to_name = canonical(to);

    if (!get_slug(from_name) || !get_slug(to_name)) {
        throw new Error("Les deux personnes doivent avoir un nom");
    }
    if (get_slug(from_name) === get_slug(to_name)) {
        throw new Error("Une personne ne peut pas être en relation avec elle-même");
    }

    const person = generator.persons.get(get_slug(from_name));
    const file = person?.file ?? path.join(persons_folder, `${get_slug(from_name)}.md`);
    const content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";

    const updated = add_relation(
        content,
        { tag: tag.trim().replace(/^-/, ""), negated: tag.trim().startsWith("-"), name: to_name, note },
        from_name
    );

    if (updated !== content) {
        written_by_api.set(file, Date.now());
        fs.writeFileSync(file, updated);
        console.log(`✎ ${path.relative(ROOT, file)} : ${tag} : ${to_name}`);
        await rebuild({ assets: false });
    }

    send_json(response, 200, {
        file: path.relative(ROOT, file),
        url: `personne-${get_slug(from_name)}.html`,
        changed: updated !== content,
    });
};

const serve_static = (request, response) => {
    const dist = path.join(ROOT, generator.config.folders.dist);
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.join(dist, pathname === "/" ? "index.html" : pathname);

    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Page introuvable");
        return;
    }

    response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(response);
};

const server = http.createServer(async (request, response) => {
    try {
        if (request.url === "/__dev/events") {
            response.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-store",
                Connection: "keep-alive",
            });
            response.write("retry: 1000\n\n");
            clients.add(response);
            request.on("close", () => clients.delete(response));
            return;
        }

        if (request.url === "/__dev/relations" && request.method === "POST") {
            await create_relation(request, response);
            return;
        }

        serve_static(request, response);
    } catch (error) {
        send_json(response, 400, { error: error.message });
    }
});

rebuild().then(() => {
    watch();
    server.listen(PORT, HOST, () => {
        console.log(`\nMode dev : http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}\n`);
    });
});
