const test = require("node:test");
const assert = require("node:assert");

const add_relation = require("../src/dev/card_writer");
const parse_person = require("../src/generator/parse_person");

test("ajoute une ligne à la fin du bloc de relations", () => {
    const result = add_relation("# A\n\nparent : B\n\nTexte.\n", { tag: "ami", name: "C" });
    assert.strictEqual(result, "# A\n\nparent : B\nami : C\n\nTexte.\n");
});

test("complète une ligne existante pour le même tag", () => {
    const result = add_relation("# A\n\nparent : B\n", { tag: "Parent", name: "C", note: "adoptif" });
    assert.strictEqual(result, "# A\n\nparent : B, C (adoptif)\n");
});

test("ne duplique pas une relation existante", () => {
    const content = "# A\n\nparent : B, C\n";
    assert.strictEqual(add_relation(content, { tag: "parent", name: "C" }), content);
});

test("distingue une relation négative", () => {
    const result = add_relation("# A\n\nmarié : B\n", { tag: "marié", negated: true, name: "C" });
    assert.strictEqual(result, "# A\n\nmarié : B\n-marié : C\n");
});

test("crée le bloc sous le titre, avant le texte", () => {
    const result = add_relation("# A\n\nUn texte.\n", { tag: "ami", name: "B" });
    assert.strictEqual(result, "# A\n\nami : B\n\nUn texte.\n");
    assert.strictEqual(parse_person(result).body, "Un texte.");
});

test("crée une fiche vide", () => {
    const result = add_relation("", { tag: "ami", name: "B" }, "Nouvelle Personne");
    assert.deepStrictEqual(parse_person(result).name, "Nouvelle Personne");
    assert.strictEqual(parse_person(result).relations[0].persons[0].name, "B");
});

test("refuse les valeurs qui cassent la syntaxe", () => {
    assert.throws(() => add_relation("# A\n", { tag: "ami", name: "B, C" }));
    assert.throws(() => add_relation("# A\n", { tag: "a:b", name: "B" }));
    assert.throws(() => add_relation("# A\n", { tag: "ami", name: "B\nparent : C" }));
});
