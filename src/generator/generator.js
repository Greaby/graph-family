const fs = require("fs");
const path = require("path");

const seedrandom = require("seedrandom");
const slugify = require("slugify");
const MarkdownIt = require("markdown-it");
const Twig = require("twig");
const { UndirectedGraph } = require("graphology");
const pagerank = require("graphology-metrics/centrality/pagerank");
const louvain = require("graphology-communities-louvain");
const { kdTree } = require("kd-tree-javascript");

const parse_person = require("./parse_person");
const RelationTypes = require("./relations");
const compute_layout = require("./layout");
const { range } = require("./interpolation");

const get_slug = (name) => slugify(name, { lower: true, strict: true, locale: "fr" });
const page_url = (slug) => `personne-${slug}.html`;

module.exports = class Generator {
    constructor(config, root = process.cwd()) {
        this.config = config;
        this.root = root;
        this.types = new RelationTypes(config);
        this.persons = new Map();
        this.relations = new Map();
        this.graph = new UndirectedGraph();
        this.timestamp = Date.now();

        this.markdown = new MarkdownIt({ linkify: true, html: true });
        this.template = Twig.twig({
            path: path.join(__dirname, "../template.twig"),
            async: false,
        });
    }

    resolve(folder) {
        return path.join(this.root, folder);
    }

    log(message) {
        if (!this.config.silent) console.log(message);
    }

    generate() {
        seedrandom(this.config.seed, { global: true });

        this.load_persons();
        this.build_graph();
        this.compute_metrics();
        this.export();

        return this.graph;
    }

    get_person(name) {
        const slug = get_slug(name);
        if (!this.persons.has(slug)) {
            this.persons.set(slug, {
                slug,
                name,
                body: "",
                has_card: false,
                relations: [],
            });
        }
        return this.persons.get(slug);
    }

    load_persons() {
        const folder = this.resolve(this.config.folders.persons);
        const files = fs
            .readdirSync(folder)
            .filter((file) => file.endsWith(".md") && !file.startsWith("."))
            .sort();

        files.forEach((file) => {
            const content = fs.readFileSync(path.join(folder, file), "utf-8");
            const card = parse_person(content, path.basename(file, ".md"));

            const person = this.get_person(card.name);
            if (person.has_card) {
                this.log(`⚠ ${file} : « ${card.name} » a déjà une fiche, les relations sont fusionnées`);
            }
            person.name = card.name;
            person.has_card = true;
            person.body = [person.body, card.body].filter((x) => x).join("\n\n");

            card.relations.forEach(({ tag, negated, persons }) => {
                const relation = this.types.resolve(tag, negated);

                persons.forEach(({ name, note }) => {
                    const other = this.get_person(name);
                    if (other.slug === person.slug) {
                        this.log(`⚠ ${file} : relation de « ${name} » vers elle-même ignorée`);
                        return;
                    }

                    this.add_relation(person.slug, other.slug, relation, note);
                });
            });
        });

        this.persons.forEach((person) => {
            if (!person.has_card) {
                this.log(`ℹ « ${person.name} » est cité·e mais n'a pas de fiche`);
            }
        });
    }

    add_relation(from, to, { type, negated, weight }, note) {
        const key = this.types.canonical_key(from, to, type, negated);
        if (this.relations.has(key)) {
            const existing = this.relations.get(key);
            existing.note = existing.note || note;
            return;
        }

        this.relations.set(key, { from, to, type, negated, weight, note });
    }

    build_graph() {
        const graph = this.graph;

        this.persons.forEach((person) => {
            graph.addNode(person.slug, {
                label: person.name,
                card: person.has_card,
            });
        });

        this.relations.forEach((relation) => {
            const { from, to, type, negated, weight, note } = relation;
            const label = this.types.label(type);
            const inverse_label = this.types.label(this.types.inverse(type));

            graph.updateEdge(from, to, (attributes) => ({
                weight: (attributes.weight || 0) + weight,
                // [personne de référence, rôle de l'autre vu par elle, rôle inverse, négatif]
                rel: [...(attributes.rel || []), [from, label, inverse_label, negated ? 1 : 0]],
            }));

            this.persons.get(from).relations.push({ type, label, negated, weight, note, other: to });
            this.persons.get(to).relations.push({
                type: this.types.inverse(type),
                label: inverse_label,
                negated,
                weight,
                note,
                other: from,
            });
        });
    }

    compute_metrics() {
        const graph = this.graph;
        const { graph: options } = this.config;

        compute_layout(graph, {
            iterations: options.layout_iterations,
            negative_distance: options.negative_distance,
        });

        // Centralité et communautés calculées sur les seuls liens positifs
        const positive = new UndirectedGraph();
        graph.forEachNode((node) => positive.addNode(node));
        graph.forEachEdge((_edge, { weight }, source, target) => {
            if (weight > 0) positive.addEdge(source, target, { weight });
        });

        const ranks = positive.size ? pagerank(positive, { getEdgeWeight: "weight" }) : {};
        const communities = positive.size
            ? louvain(positive, { getEdgeWeight: "weight", rng: Math.random })
            : {};

        const values = Object.values(ranks);
        const min_rank = Math.min(...values);
        const max_rank = Math.max(...values);

        graph.forEachNode((node) => {
            const size =
                values.length && max_rank > min_rank
                    ? range(min_rank, max_rank, options.node_min_size, options.node_max_size, ranks[node])
                    : options.node_min_size;

            graph.mergeNodeAttributes(node, {
                size: Math.round(size),
                c: communities[node] ?? 0,
            });
        });

        const points = graph.mapNodes((node, { x, y }) => ({ x, y, id: node }));
        this.kd_tree = new kdTree(
            points,
            (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
            ["x", "y"]
        );
    }

    nearby(slug) {
        const { x, y } = this.graph.getNodeAttributes(slug);
        const count = this.config.graph.nearby_count;

        return this.kd_tree
            .nearest({ x, y }, count + 1)
            .filter(([point]) => point.id !== slug)
            .sort(([, a], [, b]) => a - b)
            .slice(0, count)
            .map(([point]) => this.link(point.id));
    }

    link(slug) {
        const person = this.persons.get(slug);
        return { slug, name: person.name, url: page_url(slug), has_card: person.has_card };
    }

    // Regroupe les relations d'une personne par type, dans l'ordre de la config
    grouped_relations(person) {
        const order = Object.keys(this.types.types);
        const groups = new Map();

        [...person.relations]
            .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
            .forEach(({ label, negated, weight, note, other }) => {
                const key = `${negated ? "-" : ""}${label}`;
                if (!groups.has(key)) {
                    groups.set(key, { label, negated, negative: weight < 0, persons: [] });
                }
                groups.get(key).persons.push({ ...this.link(other), note });
            });

        return [...groups.values()];
    }

    // [[Nom Prénom]] dans le texte devient un lien vers la fiche
    render_markdown(content) {
        const html = this.markdown.render(content);
        return html.replace(/\[\[([^\]]+)\]\]/g, (match, name) => {
            const slug = get_slug(name);
            if (!this.persons.has(slug)) return name;
            return `<a href="${page_url(slug)}">${this.persons.get(slug).name}</a>`;
        });
    }

    render(file, data) {
        const html = this.template.render({
            config: this.config,
            timestamp: this.timestamp,
            ...data,
        });
        fs.writeFileSync(path.join(this.dist, file), html);
    }

    export() {
        this.dist = this.resolve(this.config.folders.dist);
        fs.mkdirSync(this.dist, { recursive: true });
        fs.readdirSync(this.dist)
            .filter((file) => file.endsWith(".html") || file.endsWith(".json"))
            .forEach((file) => fs.rmSync(path.join(this.dist, file)));

        const graph = this.graph.copy();
        graph.forEachNode((node) => {
            graph.updateNodeAttribute(node, "x", Math.round);
            graph.updateNodeAttribute(node, "y", Math.round);
        });
        fs.writeFileSync(path.join(this.dist, "graph.json"), JSON.stringify(graph.export()));

        const search = [];

        this.persons.forEach((person) => {
            search.push({ title: person.name, url: page_url(person.slug) });

            this.render(page_url(person.slug), {
                id: person.slug,
                title: person.name,
                has_card: person.has_card,
                content: this.render_markdown(person.body),
                relations: this.grouped_relations(person),
                nearby: this.nearby(person.slug),
            });
        });

        fs.writeFileSync(
            path.join(this.dist, "search.json"),
            JSON.stringify(search.sort((a, b) => a.title.localeCompare(b.title)))
        );

        const index_file = this.resolve(`${this.config.folders.data}/index.md`);
        const index_content = fs.existsSync(index_file)
            ? fs.readFileSync(index_file, "utf-8")
            : `# ${this.config.labels.project_title}`;

        this.render("index.html", {
            id: "",
            content: this.render_markdown(index_content),
        });

        this.log(`✔ ${this.persons.size} personnes, ${this.relations.size} relations`);
    }
};
