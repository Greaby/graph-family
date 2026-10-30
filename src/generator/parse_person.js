// Une fiche ressemble à :
//
//   # Nom Prénom
//
//   parent : Nom Prénom, Nom Prénom
//   -marié : Nom Prénom (1990-2001)
//
//   Texte libre en markdown...
//
// Le bloc de relations est la suite de lignes "tag : noms" qui suit le titre.
// Il s'arrête à la première ligne vide ou qui n'est pas une relation.

const TITLE_REGEX = /^#\s+(.+?)\s*#*\s*$/;
const RELATION_REGEX =
    /^\s*(?:[*+]\s+|-\s+)?(-?)\s*([\p{L}][\p{L}\p{M}'’ ·-]{0,40}?)\s*:\s*(.+?)\s*$/u;

const parse_name = (raw) => {
    let name = raw.trim().replace(/^\[\[(.+)\]\]$/, "$1");
    let note = null;

    const note_match = name.match(/^(.+?)\s*\((.+)\)$/);
    if (note_match) {
        [, name, note] = note_match;
    }

    name = name.replace(/^\[\[(.+)\]\]$/, "$1").trim();

    return { name, note };
};

const parse_relation = (line) => {
    const match = line.match(RELATION_REGEX);
    if (!match) {
        return null;
    }

    const [, negation, tag, names] = match;

    // Évite de prendre une URL ("https://...") pour une relation
    if (names.startsWith("//")) {
        return null;
    }

    return {
        tag,
        negated: negation === "-",
        persons: names
            .split(/[,;]/)
            .map(parse_name)
            .filter(({ name }) => name),
    };
};

module.exports = (content, fallback_name = "") => {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");

    let index = 0;
    const skip_blank = () => {
        while (index < lines.length && lines[index].trim() === "") {
            index++;
        }
    };

    skip_blank();

    let name = fallback_name;
    const title_match = (lines[index] || "").match(TITLE_REGEX);
    if (title_match) {
        name = title_match[1];
        index++;
    }

    skip_blank();

    const relations = [];
    while (index < lines.length) {
        const line = lines[index];
        const relation = parse_relation(line);
        if (!relation) {
            break;
        }
        relations.push(relation);
        index++;
    }

    const body = lines.slice(index).join("\n").trim();

    return { name: name.trim(), relations, body };
};
