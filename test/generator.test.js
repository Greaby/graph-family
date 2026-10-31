const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const config = require("../config");
const Generator = require("../src/generator/generator");

const build = (cards) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graph-family-"));
    fs.mkdirSync(path.join(root, "data/personnes"), { recursive: true });
    Object.entries(cards).forEach(([file, content]) => {
        fs.writeFileSync(path.join(root, "data/personnes", file), content);
    });

    const generator = new Generator({ ...config, silent: true }, root);
    const graph = generator.generate();
    return { root, graph };
};

const distance = (graph, a, b) => {
    const pa = graph.getNodeAttributes(a);
    const pb = graph.getNodeAttributes(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
};

test("ne compte pas deux fois une relation déclarée dans les deux fiches", () => {
    const { graph, root } = build({
        "a.md": "# Alice\n\nenfant : Bob",
        "b.md": "# Bob\n\nmère : Alice",
    });

    assert.strictEqual(graph.order, 2);
    assert.strictEqual(graph.size, 1);
    assert.strictEqual(graph.getEdgeAttribute("alice", "bob", "weight"), 3);
    assert.ok(fs.existsSync(path.join(root, "dist/personne-alice.html")));
    assert.ok(fs.existsSync(path.join(root, "dist/graph.json")));
});

test("une relation négative éloigne les personnes", () => {
    const cards = {
        "a.md": "# A\n\nami : C, D\n-marié : B",
        "b.md": "# B\n\nami : C, D",
        "e.md": "# E\n\nami : C, D\nmarié : F",
        "f.md": "# F\n\nami : C, D",
    };
    const { graph } = build(cards);

    assert.ok(graph.getEdgeAttribute("a", "b", "weight") < 0);
    assert.ok(distance(graph, "a", "b") > distance(graph, "e", "f") * 2);
});

test("la disposition est identique d'un build à l'autre", () => {
    const cards = {
        "a.md": "# A\n\nami : B, C\n-marié : D",
        "b.md": "# B\n\nfratrie : C",
    };
    const positions = (graph) => graph.mapNodes((node, { x, y }) => [node, x, y]);

    assert.deepStrictEqual(positions(build(cards).graph), positions(build(cards).graph));
});

test("un tag relie ses membres et a sa propre page", () => {
    const { graph, root } = build({
        "a.md": "# Alice\n\ntags : École (1990), Club",
        "b.md": "# Bob\n\nami : Alice\ntags : école",
    });

    assert.ok(graph.hasNode("#ecole"));
    assert.strictEqual(graph.getNodeAttribute("#ecole", "kind"), "tag");
    assert.deepStrictEqual(graph.neighbors("#ecole").sort(), ["alice", "bob"]);
    assert.strictEqual(graph.getEdgeAttribute("alice", "#ecole", "note"), "1990");
    assert.ok(!graph.hasNode("ecole"), "un tag n'est pas une personne");
    assert.ok(fs.existsSync(path.join(root, "dist/tag-ecole.html")));

    const page = fs.readFileSync(path.join(root, "dist/personne-alice.html"), "utf-8");
    assert.match(page, /href="tag-club.html"/);
});
