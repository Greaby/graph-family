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

const { remove_relation, remove_person, rename_person } = add_relation;

test("retire une personne d'une ligne de relation", () => {
    const result = remove_relation("# A\n\nparent : B, C (adoptif)\nami : D\n\nTexte.\n", {
        tag: "parent",
        name: "c",
    });
    assert.strictEqual(result, "# A\n\nparent : B\nami : D\n\nTexte.\n");
});

test("supprime la ligne et le bloc quand ils deviennent vides", () => {
    assert.strictEqual(remove_relation("# A\n\nami : B\n\nTexte.\n", { tag: "ami", name: "B" }), "# A\n\nTexte.\n");
    assert.strictEqual(remove_relation("# A\n\nami : B\n", { tag: "ami", name: "B" }), "# A\n");
});

test("ne retire que la relation du bon signe", () => {
    const content = "# A\n\nmarié : B\n-marié : B\n";
    assert.strictEqual(remove_relation(content, { tag: "marié", negated: true, name: "B" }), "# A\n\nmarié : B\n");
});

test("garde la puce et la négation des lignes modifiées", () => {
    const content = "# A\n\n- -ami : B, C\n";
    assert.strictEqual(remove_relation(content, { tag: "ami", negated: true, name: "B" }), "# A\n\n- -ami : C\n");
});

test("retire toutes les mentions d'une personne", () => {
    const result = remove_person("# A\n\nparent : B, C\nami : B\n\nVoir [[B]] et [[C]].\n", "B");
    assert.strictEqual(result, "# A\n\nparent : C\n\nVoir B et [[C]].\n");
});

test("renomme une personne partout dans une fiche", () => {
    const result = rename_person("# A\n\nparent : B (note), C\n\nVoir [[b]].\n", "B", "Bob");
    assert.strictEqual(result, "# A\n\nparent : Bob (note), C\n\nVoir [[Bob]].\n");
});

const RelationTypes = require("../src/generator/relations");
const types = new RelationTypes({
    relations: {
        parent: { aliases: ["père"], inverse: "enfant" },
        enfant: { aliases: ["fils", "fille"], inverse: "parent" },
    },
});

test("reconnaît une relation existante écrite avec un alias", () => {
    const content = "# A\n\nfils : B\n";
    assert.strictEqual(add_relation(content, { tag: "enfant", name: "B" }, "A", types), content);
    assert.strictEqual(add_relation(content, { tag: "enfant", name: "C" }, "A", types), "# A\n\nfils : B\nenfant : C\n");
});

test("retire une relation écrite avec un alias", () => {
    const result = remove_relation("# A\n\nfils : B, C\nfille : D\n", { tag: "enfant", name: "B" }, types);
    assert.strictEqual(result, "# A\n\nfils : C\nfille : D\n");
});

test("change la note d'une relation sans toucher à son tag ni à sa place", () => {
    const { set_note } = add_relation;
    const content = "# A\n\nfils : B, C (ancienne)\nami : D\n";
    assert.strictEqual(
        set_note(content, { tag: "enfant", name: "C", note: "nouvelle" }, types),
        "# A\n\nfils : B, C (nouvelle)\nami : D\n"
    );
    assert.strictEqual(set_note(content, { tag: "enfant", name: "C" }, types), "# A\n\nfils : B, C\nami : D\n");
});
