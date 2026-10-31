const { parse_relation } = require("../generator/parse_person");
const { normalize_tag } = require("../generator/relations");
const get_slug = require("../generator/slug");

const FORBIDDEN = /[\n\r:,;()[\]]/;

const format_person = ({ name, note }) => (note ? `${name} (${note})` : name);

// Make sure a user-provided value won't break the card syntax
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

// Split a card into: head (title), relation block, rest of the text
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
        // no relations: keep everything after the title as is
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

// With `types` (RelationTypes), aliases match too: "fils" and "enfant" are the same type
const same_type = (relation, tag, negated, types) =>
    types
        ? relation.negated === negated && types.resolve(relation.tag).type === types.resolve(tag).type
        : same_tag(relation, tag, negated);

const lists_person = (relation, name) =>
    relation.persons.some((person) => get_slug(person.name) === get_slug(name));

// Apply `transform(relation, person)` to every person listed in the relation
// block: return the (possibly modified) person, or null to remove it
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

// Add a relation to the relation block of a card.
// If a line already exists for this exact tag, the name is appended to it
// ("parent : A" => "parent : A, B"), otherwise a line is added at the end of the block.
// Nothing changes if the relation is already there (under any alias when `types` is given).
const add_relation = (content, { tag, negated = false, name, note = null }, title = name, types = null) => {
    tag = tag.trim().replace(/^-/, "");
    name = name.trim();
    note = note?.trim() || null;
    validate({ tag, name, note });

    const card = split_card(content || `# ${title}\n`);
    const relations = card.block.map(parse_relation);

    if (relations.some((relation) => same_type(relation, tag, negated, types) && lists_person(relation, name))) {
        return content;
    }

    const index = relations.findIndex((relation) => same_tag(relation, tag, negated));
    if (index === -1) {
        card.block.push(`${negated ? "-" : ""}${tag} : ${format_person({ name, note })}`);
    } else {
        card.block[index] = `${card.block[index].trimEnd()}, ${format_person({ name, note })}`;
    }

    return join_card(card);
};

// Remove one specific relation (tag + person) from a card
// (under any alias when `types` is given)
const remove_relation = (content, { tag, negated = false, name }, types = null) =>
    join_card(
        map_relations(content, (relation, person) =>
            same_type(relation, tag, negated, types) && get_slug(person.name) === get_slug(name) ? null : person
        )
    );

const replace_wiki_links = (lines, name, replacement) =>
    lines.map((line) =>
        line.replace(/\[\[([^\]]+)\]\]/g, (match, linked) =>
            get_slug(linked) === get_slug(name) ? replacement : match
        )
    );

// Remove every relation to a person ([[Name]] becomes plain text)
const remove_person = (content, name) => {
    const card = map_relations(content, (_relation, person) =>
        get_slug(person.name) === get_slug(name) ? null : person
    );
    card.rest = replace_wiki_links(card.rest, name, name);
    return join_card(card);
};

// Rename a person in the relations and [[Name]] links
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
