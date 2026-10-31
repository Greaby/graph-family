const { parse_relation } = require("../generator/parse_person");
const { normalize_tag } = require("../generator/relations");

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

// Ajoute une relation au bloc de relations d'une fiche.
// Si une ligne existe déjà pour ce tag, le nom y est ajouté
// ("parent : A" => "parent : A, B"), sinon une ligne est créée à la fin du bloc.
module.exports = (content, { tag, negated = false, name, note = null }, title = name) => {
    tag = tag.trim().replace(/^-/, "");
    name = name.trim();
    note = note?.trim() || null;
    validate({ tag, name, note });

    const lines = (content || `# ${title}\n`).replace(/\r\n?/g, "\n").split("\n");

    let index = 0;
    while (index < lines.length && lines[index].trim() === "") index++;
    if (/^#\s/.test(lines[index] || "")) index++;
    const title_end = index;
    while (index < lines.length && lines[index].trim() === "") index++;

    const block_start = index;
    while (index < lines.length && parse_relation(lines[index])) {
        const relation = parse_relation(lines[index]);
        const same_tag =
            relation.negated === negated && normalize_tag(relation.tag) === normalize_tag(tag);

        if (same_tag) {
            if (relation.persons.some((person) => person.name === name)) {
                return lines.join("\n");
            }
            lines[index] = `${lines[index].trimEnd()}, ${format_person({ name, note })}`;
            return lines.join("\n");
        }
        index++;
    }

    const line = `${negated ? "-" : ""}${tag} : ${format_person({ name, note })}`;

    if (index > block_start) {
        lines.splice(index, 0, line);
    } else {
        // Pas encore de relations : bloc inséré sous le titre, séparé du texte
        const rest = lines.slice(block_start);
        const has_body = rest.some((l) => l.trim() !== "");
        lines.splice(title_end, lines.length - title_end, "", line, ...(has_body ? ["", ...rest] : [""]));
    }

    return lines.join("\n");
};
