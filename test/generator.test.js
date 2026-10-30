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
