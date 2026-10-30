const test = require("node:test");
const assert = require("node:assert");

const RelationTypes = require("../src/generator/relations");

const types = new RelationTypes({
    default_relation_weight: 1,
    relations: {
        parent: { label: "Parent", aliases: ["père"], inverse: "enfant", weight: 3 },
        enfant: { label: "Enfant", aliases: ["fille"], inverse: "parent", weight: 3 },
        marié: { label: "Marié·e", aliases: ["épouse"], weight: 4 },
        divorcé: { label: "Divorcé·e", weight: -2 },
    },
});

test("résout alias, négation et tags inconnus", () => {
    assert.deepStrictEqual(types.resolve("Père"), { type: "parent", negated: false, weight: 3 });
    assert.deepStrictEqual(types.resolve("-marié"), { type: "marié", negated: true, weight: -4 });
    assert.deepStrictEqual(types.resolve("épouse", true), { type: "marié", negated: true, weight: -4 });
    assert.deepStrictEqual(types.resolve("divorcé"), { type: "divorcé", negated: false, weight: -2 });
    assert.deepStrictEqual(types.resolve("voisin"), { type: "voisin", negated: false, weight: 1 });
});

test("une relation déclarée des deux côtés a la même clé", () => {
    assert.strictEqual(
        types.canonical_key("a", "b", "parent", false),
        types.canonical_key("b", "a", "enfant", false)
    );
    assert.strictEqual(
        types.canonical_key("a", "b", "marié", false),
        types.canonical_key("b", "a", "marié", false)
    );
    assert.notStrictEqual(
        types.canonical_key("a", "b", "marié", false),
        types.canonical_key("a", "b", "marié", true)
    );
});
