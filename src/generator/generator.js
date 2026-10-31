const fs = require("fs");
const path = require("path");

const seedrandom = require("seedrandom");
const MarkdownIt = require("markdown-it");
const Twig = require("twig");
const { UndirectedGraph } = require("graphology");
const pagerank = require("graphology-metrics/centrality/pagerank");
const louvain = require("graphology-communities-louvain");
const { kdTree } = require("kd-tree-javascript");

const parse_person = require("./parse_person");
const RelationTypes = require("./relations");
const { normalize_tag } = RelationTypes;
const compute_layout = require("./layout");
const { range } = require("./interpolation");

const get_slug = require("./slug");
const page_url = (slug) => `personne-${slug}.html`;
const group_url = (slug) => `tag-${slug}.html`;
// "#" can't appear in a person slug, so tag nodes never collide with people
const group_key = (slug) => `#${slug}`;

class Generator {
    constructor(config, root = process.cwd()) {
        this.config = config;
        this.root = root;
        this.types = new RelationTypes(config);
        this.persons = new Map();
        this.relations = new Map();
        this.groups = new Map();
        this.graph = new UndirectedGraph();
        this.timestamp = Date.now();

        this.markdown = new MarkdownIt({ linkify: true, html: true });
        Twig.cache(false);
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
        // Same seed => same layout on every build
        this.rng = seedrandom(this.config.seed);

        this.load_persons();
        this.build_graph();
        this.compute_metrics();
        this.export();

        return this.graph;
    }

    is_group_tag(tag) {
        return normalize_tag(tag) === normalize_tag(this.config.groups.keyword);
    }

    get_group(name) {
        const slug = get_slug(name);
        if (!this.groups.has(slug)) {
            this.groups.set(slug, { slug, key: group_key(slug), name, members: new Map() });
        }
        return this.groups.get(slug);
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
            person.file = path.join(folder, file);
            person.body = [person.body, card.body].filter((x) => x).join("\n\n");

            card.relations.forEach(({ tag, negated, persons }) => {
                if (this.is_group_tag(tag)) {
                    persons.forEach(({ name, note }) => {
                        this.get_group(name).members.set(person.slug, note);
                    });
                    return;
                }

                const relation = this.types.resolve(tag, negated);

                persons.forEach(({ name, note }) => {
                    const other = this.get_person(name);
                    if (other.slug === person.slug) {
                        this.log(`⚠ ${file} : relation de « ${name} » vers elle-même ignorée`);
                        return;
                    }

                    this.add_relation(person.slug, other.slug, relation, note, {
                        file: person.file,
                        tag,
                        negated,
                        name,
                    });
                });
            });
        });

        this.persons.forEach((person) => {
            if (!person.has_card) {
                this.log(`ℹ « ${person.name} » est cité·e mais n'a pas de fiche`);
            }
        });
    }

    // `source`: where the relation is written (a relation declared in both
    // cards has two sources), so the editor can change it
    add_relation(from, to, { type, negated, weight }, note, source) {
        const key = this.types.canonical_key(from, to, type, negated);
        if (this.relations.has(key)) {
            const existing = this.relations.get(key);
            existing.note = existing.note || note;
            existing.sources.push(source);
            return;
        }

        this.relations.set(key, { key, from, to, type, negated, weight, note, sources: [source] });
    }

    build_graph() {
        const graph = this.graph;

        this.persons.forEach((person) => {
            graph.addNode(person.slug, {
                label: person.name,
                card: person.has_card,
                url: page_url(person.slug),
            });
            person.groups = [];
        });

        this.groups.forEach((group) => {
            graph.addNode(group.key, { label: group.name, kind: "tag", url: group_url(group.slug) });

            group.members.forEach((note, member) => {
                graph.addEdge(member, group.key, { weight: this.config.groups.weight, tag: 1, note });
                this.persons.get(member).groups.push({ group, note });
            });
        });

        this.relations.forEach((relation) => {
            const { key, from, to, type, negated, weight, note } = relation;
            const label = this.types.label(type);
            const inverse_label = this.types.label(this.types.inverse(type));

            graph.updateEdge(from, to, (attributes) => ({
                weight: (attributes.weight || 0) + weight,
                // [reference person, role of the other one seen by them, inverse role, negated]
                rel: [...(attributes.rel || []), [from, label, inverse_label, negated ? 1 : 0]],
            }));

            this.persons.get(from).relations.push({ key, type, label, negated, weight, note, other: to });
            this.persons.get(to).relations.push({
                key,
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
            rng: this.rng,
        });

        // Centrality and communities are computed on positive edges only
        const positive = new UndirectedGraph();
        graph.forEachNode((node) => positive.addNode(node));
        graph.forEachEdge((_edge, { weight }, source, target) => {
            if (weight > 0) positive.addEdge(source, target, { weight });
        });

        const ranks = positive.size ? pagerank(positive, { getEdgeWeight: "weight" }) : {};
        const communities = positive.size
            ? louvain(positive, { getEdgeWeight: "weight", rng: this.rng })
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

        // Tags are sized by their number of members
        const max_members = Math.max(1, ...[...this.groups.values()].map((group) => group.members.size));
        this.groups.forEach((group) => {
            const size = range(1, max_members, options.node_min_size + 2, options.node_max_size, group.members.size);
            graph.setNodeAttribute(group.key, "size", Math.round(size));
        });

        // "Nearby people" only lists people, not tags
        const points = graph
            .filterNodes((_node, attributes) => attributes.kind !== "tag")
            .map((node) => ({ ...graph.getNodeAttributes(node), id: node }));
        this.kd_tree = new kdTree(
            points,
            (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
            ["x", "y"]
        );
    }

    nearby(node) {
        const { x, y } = this.graph.getNodeAttributes(node);
        const count = this.config.graph.nearby_count;

        return this.kd_tree
            .nearest({ x, y }, count + 1)
            .filter(([point]) => point.id !== node)
            .sort(([, a], [, b]) => a - b)
            .slice(0, count)
            .map(([point]) => this.link(point.id));
    }

    link(slug) {
        const person = this.persons.get(slug);
        return { slug, name: person.name, url: page_url(slug), has_card: person.has_card };
    }

    // Group the relations of a person by type, in config order
    grouped_relations(person) {
        const order = Object.keys(this.types.types);
        const groups = new Map();

        [...person.relations]
            .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
            .forEach(({ key, type, label, negated, weight, note, other }) => {
                const group = `${negated ? "-" : ""}${label}`;
                if (!groups.has(group)) {
                    groups.set(group, { label, negated, negative: weight < 0, persons: [] });
                }
                groups.get(group).persons.push({
                    ...this.link(other),
                    note,
                    relation: { key, tag: `${negated ? "-" : ""}${type}` },
                });
            });

        const tags = [...person.groups]
            .sort((a, b) => a.group.name.localeCompare(b.group.name))
            .map(({ group, note }) => ({
                slug: group.slug,
                name: group.name,
                url: group_url(group.slug),
                has_card: true,
                note,
                membership: { person: person.name, group: group.name },
            }));
        if (tags.length) {
            groups.set("#tags", { label: this.config.groups.label, persons: tags });
        }

        return [...groups.values()];
    }

    // Members of a tag, listed on its page
    group_members(group) {
        const persons = [...group.members]
            .map(([member, note]) => ({
                ...this.link(member),
                note,
                membership: { person: this.persons.get(member).name, group: group.name },
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return [{ label: "", persons }];
    }

    // "Martin Paul — Parent : Martin Jean, Martin Hélène · Enfant : Martin Lucas"
    describe(person) {
        const relations = this.grouped_relations(person)
            .map(({ label, persons }) => `${label} : ${persons.map((p) => p.name).join(", ")}`)
            .join(" · ");
        return relations ? `${person.name} — ${relations}` : person.name;
    }

    // [[Last First]] in the text becomes a link to the card (or to the tag page)
    render_markdown(content) {
        const html = this.markdown.render(content);
        return html.replace(/\[\[([^\]]+)\]\]/g, (match, name) => {
            const slug = get_slug(name);
            if (this.persons.has(slug)) {
                return `<a href="${page_url(slug)}">${this.persons.get(slug).name}</a>`;
            }
            if (this.groups.has(slug)) {
                return `<a href="${group_url(slug)}">${this.groups.get(slug).name}</a>`;
            }
            return name;
        });
    }

    // Only the part of the config the browser needs is injected in the pages
    front_config() {
        const { colors, edge_colors, negative_edge_color, current_node, groups, dev } = this.config;
        const front = {
            colors,
            edge_colors,
            negative_edge_color,
            current_node_color: current_node.color,
            group_color: groups.color,
            group_edge_color: groups.edge_color,
        };

        if (dev) {
            front.dev = true;
            front.group_keyword = groups.keyword;
            front.relation_tags = [
                { value: groups.keyword, label: groups.label },
                ...Object.entries(this.types.aliases).map(([tag, type]) => ({
                    value: tag,
                    label: this.types.label(type),
                })),
            ];
        }

        return front;
    }

    render(file, data) {
        const html = this.template.render({
            config: this.config,
            timestamp: this.timestamp,
            front_config: this.front_config(),
            url: file === "index.html" ? "" : file,
            description: this.config.labels.description,
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
        // Stable edge keys across builds (graphology generates random keys)
        const data = graph.export();
        data.edges.forEach((edge, index) => (edge.key = String(index)));
        fs.writeFileSync(path.join(this.dist, "graph.json"), JSON.stringify(data));

        const search = [];

        this.persons.forEach((person) => {
            search.push({ title: person.name, url: page_url(person.slug) });

            this.render(page_url(person.slug), {
                id: person.slug,
                title: person.name,
                description: this.describe(person),
                has_card: person.has_card,
                content: this.render_markdown(person.body),
                relations: this.grouped_relations(person),
                nearby: this.nearby(person.slug),
            });
        });

        this.groups.forEach((group) => {
            search.push({ title: group.name, url: group_url(group.slug) });

            const description_file = this.resolve(`${this.config.folders.groups}/${group.slug}.md`);
            const description = fs.existsSync(description_file)
                ? parse_person(fs.readFileSync(description_file, "utf-8")).body
                : "";

            this.render(group_url(group.slug), {
                id: group.key,
                group: group.slug,
                title: group.name,
                description: `${group.name} — ${[...group.members.keys()].map((m) => this.persons.get(m).name).join(", ")}`,
                has_card: true,
                content: this.render_markdown(description),
                relations_title: this.config.groups.members_label,
                relations: this.group_members(group),
                nearby: this.nearby(group.key),
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

        this.log(`✔ ${this.persons.size} personnes, ${this.relations.size} relations, ${this.groups.size} tags`);
    }
}

module.exports = Generator;
module.exports.get_slug = get_slug;
module.exports.group_key = group_key;
