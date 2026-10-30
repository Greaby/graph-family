const test = require("node:test");
const assert = require("node:assert");

const parse_person = require("../src/generator/parse_person");

test("lit le titre, les relations et le texte", () => {
    const card = parse_person(`# Martin Paul

parent : Martin Jean, Martin Hélène
-marié : Garnier Julie (2005-2014)
- ami : [[Faure Thomas]]

Texte libre : avec deux-points.`);

    assert.strictEqual(card.name, "Martin Paul");
    assert.deepStrictEqual(card.relations, [
        {
            tag: "parent",
            negated: false,
            persons: [
                { name: "Martin Jean", note: null },
                { name: "Martin Hélène", note: null },
            ],
        },
        {
            tag: "marié",
            negated: true,
            persons: [{ name: "Garnier Julie", note: "2005-2014" }],
        },
        {
            tag: "ami",
            negated: false,
            persons: [{ name: "Faure Thomas", note: null }],
        },
    ]);
    assert.strictEqual(card.body, "Texte libre : avec deux-points.");
});

test("utilise le nom de fichier sans titre", () => {
    const card = parse_person("ami : Bob", "alice");
    assert.strictEqual(card.name, "alice");
    assert.strictEqual(card.relations.length, 1);
});

test("une ligne vide termine le bloc de relations", () => {
    const card = parse_person(`# A

ami : B

Note : ceci n'est pas une relation`);
    assert.strictEqual(card.relations.length, 1);
    assert.strictEqual(card.body, "Note : ceci n'est pas une relation");
});
