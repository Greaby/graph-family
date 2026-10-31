// Development server: serves the site, rebuilds it when a card or a source
// file changes, and lets you edit relations and cards from the browser.
const fs = require("fs");
const path = require("path");
const http = require("http");

const build = require("../../build");
const get_slug = require("../generator/slug");
const parse_person = require("../generator/parse_person");
const { add_relation, remove_relation, remove_person, rename_person } = require("./card_writer");

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

// Builds are queued: never two at once, and requests received during a build
// are merged into a single next build
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

// Files written by the editor: the API already triggers their build
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

const write_file = (file, content) => {
    written_by_api.set(file, Date.now());
    fs.writeFileSync(file, content);
    console.log(`✎ ${path.relative(ROOT, file)}`);
};

const persons_folder = () => path.join(ROOT, generator.config.folders.persons);
const card_files = () => [...generator.persons.values()].filter((p) => p.file).map((p) => p.file);
const page_url = (slug) => `personne-${slug}.html`;

// Apply `transform` to every card, only writing the ones that change
const update_all_cards = (transform, except = null) => {
    card_files()
        .filter((file) => file !== except && fs.existsSync(file))
        .forEach((file) => {
            const content = fs.readFileSync(file, "utf-8");
            const updated = transform(content);
            if (updated !== content) write_file(file, updated);
        });
};

// Read a person's card (or start a new one), apply `transform(content, title)`
// and write it if it changed
const edit_card = (name, transform) => {
    const person = generator.persons.get(get_slug(name));
    const file = person?.file ?? path.join(persons_folder(), `${get_slug(name)}.md`);
    const content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
    const updated = transform(content, person?.name ?? name);

    if (updated !== content) write_file(file, updated);
    return { file: path.relative(ROOT, file), changed: updated !== content };
};

// The same relation written from the other person's side:
// "A — parent : B" becomes "B — enfant : A"
const inverse_of = ({ tag, negated, note }, from_name) => ({
    tag: generator.types.inverse(generator.types.resolve(tag).type),
    negated,
    name: from_name,
    note,
});

const find_relation = (key) => {
    const relation = generator.relations.get(key);
    if (!relation) throw new Error("Relation introuvable, la page n'est peut-être pas à jour");
    return relation;
};

// Remove a relation from every card where it is written (both sides)
const delete_relation_sources = (relation) => {
    relation.sources.forEach(({ file, tag, negated, name }) => {
        const content = fs.readFileSync(file, "utf-8");
        const updated = remove_relation(content, { tag, negated, name });
        if (updated !== content) write_file(file, updated);
    });
};

// Relations listed in a card, keyed by "other person|type|negated"
const card_relations = (content, own_slug) => {
    const relations = new Map();
    parse_person(content).relations.forEach(({ tag, negated, persons }) => {
        const { type } = generator.types.resolve(tag);
        persons
            .filter(({ name }) => get_slug(name) && get_slug(name) !== own_slug)
            .forEach(({ name, note }) => {
                relations.set(`${get_slug(name)}|${type}|${negated}`, { tag: type, negated, name, note });
            });
    });
    return relations;
};

// Keep the other cards in sync after a card was edited by hand: relations
// added to the card are written on the other side, removed ones are removed
const sync_other_cards = (name, old_content, new_content) => {
    const own_slug = get_slug(name);
    const before = card_relations(old_content, own_slug);
    const after = card_relations(new_content, own_slug);
    const files = new Set();

    before.forEach((relation, key) => {
        if (after.has(key)) return;
        const inverse = inverse_of(relation, name);
        const result = edit_card(relation.name, (content) =>
            content ? remove_relation(content, inverse, generator.types) : content
        );
        if (result.changed) files.add(result.file);
    });

    after.forEach((relation, key) => {
        if (before.has(key)) return;
        const result = edit_card(relation.name, (content, title) =>
            add_relation(content, inverse_of(relation, name), title, generator.types)
        );
        if (result.changed) files.add(result.file);
    });

    return [...files];
};

// POST /__dev/relations { from, tag, to, note, replace? }
// Write the relation in the card of `from`, and its inverse in the card of `to`.
// `replace`: key of a relation to replace (edit).
const save_relation = async (request, response) => {
    const { from = "", tag = "", to = "", note = "", replace = null } = await read_json(request);

    // Reuse the exact spelling of an existing person
    const canonical = (name) => generator.persons.get(get_slug(name))?.name ?? name.trim();
    const from_name = canonical(from);
    const to_name = canonical(to);

    if (!get_slug(from_name) || !get_slug(to_name)) {
        throw new Error("Les deux personnes doivent avoir un nom");
    }
    if (get_slug(from_name) === get_slug(to_name)) {
        throw new Error("Une personne ne peut pas être en relation avec elle-même");
    }

    const relation = { tag: tag.trim().replace(/^-/, ""), negated: tag.trim().startsWith("-"), name: to_name, note };
    const inverse = inverse_of(relation, from_name);

    // Validate both sides before removing the old relation
    add_relation("", relation, from_name);
    add_relation("", inverse, to_name);
    if (replace) delete_relation_sources(find_relation(replace));

    // The relation is written in both cards
    const results = [
        edit_card(from_name, (content, title) => add_relation(content, relation, title, generator.types)),
        edit_card(to_name, (content, title) => add_relation(content, inverse, title, generator.types)),
    ];

    await rebuild({ assets: false });
    send_json(response, 200, {
        files: results.filter((result) => result.changed).map((result) => result.file),
        changed: Boolean(replace) || results.some((result) => result.changed),
    });
};

// DELETE /__dev/relations { key }
const delete_relation = async (request, response) => {
    const { key } = await read_json(request);
    delete_relation_sources(find_relation(key));
    await rebuild({ assets: false });
    send_json(response, 200, { ok: true });
};

const find_person = (slug) => {
    const person = generator.persons.get(slug);
    if (!person) throw new Error("Personne introuvable");
    return person;
};

// GET /__dev/cards/:slug: raw markdown content of the card
const read_card = (slug, response) => {
    const person = find_person(slug);
    const content = person.file ? fs.readFileSync(person.file, "utf-8") : `# ${person.name}\n\n`;
    send_json(response, 200, {
        name: person.name,
        exists: Boolean(person.file),
        file: path.relative(ROOT, person.file ?? path.join(persons_folder(), `${slug}.md`)),
        content,
    });
};

// PUT /__dev/cards/:slug { content }: save the card. If the name changes,
// the file is renamed and the other cards are updated. Relations added or
// removed in the card are added or removed in the other person's card too.
const save_card = async (slug, request, response) => {
    const person = find_person(slug);
    const { content = "" } = await read_json(request);

    const card = parse_person(content);
    const new_slug = get_slug(card.name);
    if (!new_slug) throw new Error("La fiche doit commencer par un titre : # Nom Prénom");

    let file = person.file ?? path.join(persons_folder(), `${slug}.md`);
    const old_content = person.file ? fs.readFileSync(person.file, "utf-8") : "";

    if (new_slug !== slug) {
        if (generator.persons.get(new_slug)?.file) {
            throw new Error(`« ${card.name} » a déjà une fiche`);
        }

        update_all_cards((text) => rename_person(text, person.name, card.name), person.file);

        // File named after the old name: it follows the new name
        if (person.file && path.basename(person.file, ".md") === slug) {
            const renamed = path.join(path.dirname(person.file), `${new_slug}.md`);
            written_by_api.set(person.file, Date.now());
            fs.renameSync(person.file, renamed);
            file = renamed;
        } else if (!person.file) {
            file = path.join(persons_folder(), `${new_slug}.md`);
        }
    }

    write_file(file, content.endsWith("\n") ? content : `${content}\n`);
    const synced = sync_other_cards(card.name, old_content, content);

    await rebuild({ assets: false });
    send_json(response, 200, { url: page_url(new_slug), file: path.relative(ROOT, file), synced });
};

// DELETE /__dev/cards/:slug: delete the card and every relation to this person
const delete_card = async (slug, response) => {
    const person = find_person(slug);

    update_all_cards((text) => remove_person(text, person.name), person.file);
    if (person.file) {
        written_by_api.set(person.file, Date.now());
        fs.rmSync(person.file);
        console.log(`✕ ${path.relative(ROOT, person.file)}`);
    }

    await rebuild({ assets: false });
    send_json(response, 200, { url: "index.html" });
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

        if (request.url === "/__dev/relations") {
            if (request.method === "POST") return await save_relation(request, response);
            if (request.method === "DELETE") return await delete_relation(request, response);
        }

        const card_match = request.url.match(/^\/__dev\/cards\/([a-z0-9-]+)$/);
        if (card_match) {
            const [, slug] = card_match;
            if (request.method === "GET") return read_card(slug, response);
            if (request.method === "PUT") return await save_card(slug, request, response);
            if (request.method === "DELETE") return await delete_card(slug, response);
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
