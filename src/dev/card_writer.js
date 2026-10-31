const { parse_relation } = require("../generator/parse_person");
const { normalize_tag } = require("../generator/relations");
const get_slug = require("../generator/slug");

const FORBIDDEN = /[\n\r:,;()[\]]/;

const format_person = ({ name, note }) => (note ? `${name} (${note})` : name);

// Vérifie qu'une valeur saisie ne cassera pas la syntaxe des fiches
const validate = ({ tag, name, note }) => {
    if (!tag || !/^\p{L}[\p{L}\p{M}'’ ·-]{0,40}$/u.test(tag.trim())) {
        throw new Error(`Tag invalide : « ${tag} »`);
    }
    if (!name || FORBIDDEN.test(name)) {
        throw new Error(`Nom invalide : « ${name} »`);
    }
    if (note && /[\n\r()]/.test(note)) {
        throw new Error(`Note invalide : « ${note} »`);
    }
};

// Découpe une fiche en : en-tête (titre), bloc de relations, reste du texte
const split_card = (content) => {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");

    let index = 0;
    while (index < lines.length && lines[index].trim() === "") index++;
    if (/^#\s/.test(lines[index] || "")) index++;
    const head = lines.slice(0, index);

    while (index < lines.length && lines[index].trim() === "") index++;
    const block_start = index;
    while (index < lines.length && parse_relation(lines[index])) index++;

    return {
        head,
        block: lines.slice(block_start, index),
        // texte sans relations : on garde tout ce qui suit le titre tel quel
        rest: index > block_start ? lines.slice(index) : lines.slice(head.length),
    };
};

const join_card = ({ head, block, rest }) => {
    while (rest.length && rest[0].trim() === "") rest = rest.slice(1);
    const parts = [...head];
    if (block.length) parts.push("", ...block);
    if (rest.length) parts.push("", ...rest);
    else parts.push("");
    return parts.join("\n");
};

const same_tag = (relation, tag, negated) =>
    relation.negated === negated && normalize_tag(relation.tag) === normalize_tag(tag);

// Applique `transform(relation, person)` à chaque personne citée dans le bloc de
// relations : renvoyer la personne (éventuellement modifiée) ou null pour la retirer
const map_relations = (content, transform) => {
    const card = split_card(content);

    card.block = card.block
        .map((line) => {
            const relation = parse_relation(line);
            const persons = relation.persons
                .map((person) => transform(relation, person))
                .filter(Boolean);

            if (!persons.length) return null;
            const prefix = line.slice(0, line.indexOf(":") + 1);
            return `${prefix} ${persons.map(format_person).join(", ")}`;
        })
        .filter((line) => line !== null);

    return card;
};

// Ajoute une relation au bloc de relations d'une fiche.
// Si une ligne existe déjà pour ce tag, le nom y est ajouté
// ("parent : A" => "parent : A, B"), sinon une ligne est créée à la fin du bloc.
const add_relation = (content, { tag, negated = false, name, note = null }, title = name) => {
    tag = tag.trim().replace(/^-/, "");
    name = name.trim();
    note = note?.trim() || null;
    validate({ tag, name, note });

    const card = split_card(content || `# ${title}\n`);
    const index = card.block.findIndex((line) => same_tag(parse_relation(line), tag, negated));

    if (index === -1) {
        card.block.push(`${negated ? "-" : ""}${tag} : ${format_person({ name, note })}`);
    } else {
        const relation = parse_relation(card.block[index]);
        if (relation.persons.some((person) => get_slug(person.name) === get_slug(name))) {
            return content;
        }
        card.block[index] = `${card.block[index].trimEnd()}, ${format_person({ name, note })}`;
    }

    return join_card(card);
};

// Retire une relation précise (tag + personne) d'une fiche
const remove_relation = (content, { tag, negated = false, name }) =>
    join_card(
        map_relations(content, (relation, person) =>
            same_tag(relation, tag, negated) && get_slug(person.name) === get_slug(name) ? null : person
        )
    );

const replace_wiki_links = (lines, name, replacement) =>
    lines.map((line) =>
        line.replace(/\[\[([^\]]+)\]\]/g, (match, linked) =>
            get_slug(linked) === get_slug(name) ? replacement : match
        )
    );

// Retire toutes les relations vers une personne ([[Nom]] devient du texte simple)
const remove_person = (content, name) => {
    const card = map_relations(content, (_relation, person) =>
        get_slug(person.name) === get_slug(name) ? null : person
    );
    card.rest = replace_wiki_links(card.rest, name, name);
    return join_card(card);
};

// Renomme une personne dans les relations et les liens [[Nom]]
const rename_person = (content, old_name, new_name) => {
    validate({ tag: "x", name: new_name });
    const card = map_relations(content, (_relation, person) =>
        get_slug(person.name) === get_slug(old_name) ? { ...person, name: new_name } : person
    );
    card.rest = replace_wiki_links(card.rest, old_name, `[[${new_name}]]`);
    return join_card(card);
};

module.exports = add_relation;
module.exports.add_relation = add_relation;
module.exports.remove_relation = remove_relation;
module.exports.remove_person = remove_person;
module.exports.rename_person = rename_person;
