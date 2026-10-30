const normalize_tag = (tag) => tag.trim().toLowerCase().replace(/\s+/g, "-");

// Résout les tags écrits dans les fiches vers les types déclarés dans la config
module.exports = class RelationTypes {
    constructor(config) {
        this.types = {};
        this.aliases = {};
        this.default_weight = config.default_relation_weight ?? 1;

        Object.entries(config.relations || {}).forEach(([key, type]) => {
            key = normalize_tag(key);
            this.types[key] = {
                key,
                label: type.label || key,
                inverse: type.inverse ? normalize_tag(type.inverse) : key,
                weight: type.weight ?? this.default_weight,
            };
            this.aliases[key] = key;
            (type.aliases || []).forEach((alias) => {
                this.aliases[normalize_tag(alias)] = key;
            });
        });
    }

    get(key) {
        if (!this.types[key]) {
            this.types[key] = {
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                inverse: key,
                weight: this.default_weight,
            };
        }
        return this.types[key];
    }

    // "-Marié" => { type: "marié", negated: true, weight: -4 }
    resolve(raw_tag, negated = false) {
        let tag = normalize_tag(raw_tag);
        if (tag.startsWith("-")) {
            negated = true;
            tag = tag.slice(1);
        }

        const type = this.get(this.aliases[tag] ?? tag);
        const weight = negated ? -Math.abs(type.weight) : type.weight;

        return { type: type.key, negated, weight };
    }

    inverse(type_key) {
        return this.get(type_key).inverse;
    }

    label(type_key) {
        return this.get(type_key).label;
    }

    // Clé identique pour (A parent de B) et (B enfant de A), afin de ne pas
    // compter deux fois une relation déclarée dans les deux fiches
    canonical_key(from, to, type_key, negated) {
        const inverse = this.inverse(type_key);

        if (inverse === type_key) {
            [from, to] = [from, to].sort();
        } else if (inverse < type_key) {
            [from, to, type_key] = [to, from, inverse];
        }

        return [from, to, type_key, negated ? "-" : "+"].join("|");
    }
};

module.exports.normalize_tag = normalize_tag;
