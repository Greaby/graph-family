module.exports = {
    base_url: "https://greaby.github.io/graph-family/",
    language: "fr",

    // Graine du générateur aléatoire : même données => même graphe
    seed: "graph-family",

    folders: {
        dist: "dist",
        data: "data",
        persons: "data/personnes",
    },

    labels: {
        project_title: "Graph Family",
        search: "Rechercher",
        relations: "Relations",
        nearby: "Personnes proches",
        missing_card: "Cette personne n'a pas encore de fiche.",
        show_negative: "Afficher les relations négatives",
        negative: "négatif",
        graph: "Graphe des relations",
        description: "Graphe interactif des relations familiales et amicales",
    },

    // Types de relations.
    //
    // - label   : libellé affiché sur les fiches
    // - aliases : autres tags acceptés dans les fiches pour ce type
    // - inverse : type vu depuis l'autre personne (parent <-> enfant).
    //             Absent = relation symétrique (ami <-> ami).
    // - weight  : force d'attraction dans le graphe. Une valeur négative
    //             repousse les deux personnes.
    //
    // Préfixer un tag par "-" dans une fiche (ex: "-marié") force la relation
    // en négatif : elle repousse au lieu d'attirer.
    //
    // Un tag inconnu est accepté tel quel : symétrique, de poids
    // `default_relation_weight`.
    relations: {
        parent: { label: "Parent", aliases: ["père", "mère"], inverse: "enfant", weight: 3 },
        enfant: { label: "Enfant", aliases: ["fils", "fille"], inverse: "parent", weight: 3 },
        "grand-parent": { label: "Grand-parent", aliases: ["grand-père", "grand-mère"], inverse: "petit-enfant", weight: 2 },
        "petit-enfant": { label: "Petit-enfant", aliases: ["petit-fils", "petite-fille"], inverse: "grand-parent", weight: 2 },
        oncle: { label: "Oncle / tante", aliases: ["tante"], inverse: "neveu", weight: 1.5 },
        neveu: { label: "Neveu / nièce", aliases: ["nièce"], inverse: "oncle", weight: 1.5 },
        fratrie: { label: "Frère / sœur", aliases: ["frère", "sœur", "soeur"], weight: 3 },
        cousin: { label: "Cousin·e", aliases: ["cousine"], weight: 1 },
        marié: { label: "Marié·e", aliases: ["mariée", "époux", "épouse"], weight: 4 },
        conjoint: { label: "Conjoint·e", aliases: ["compagnon", "compagne"], weight: 4 },
        divorcé: { label: "Divorcé·e", aliases: ["divorcée"], weight: -2 },
        ami: { label: "Ami·e", aliases: ["amie"], weight: 1.5 },
        collègue: { label: "Collègue", weight: 0.5 },
        ennemi: { label: "Ennemi·e", aliases: ["ennemie"], weight: -3 },
    },
    default_relation_weight: 1,

    graph: {
        node_min_size: 4,
        node_max_size: 18,

        // Distance minimale (en multiple de la longueur médiane des liens
        // positifs) visée entre deux personnes liées négativement
        negative_distance: 4,
        layout_iterations: 2000,
        // Nombre de personnes proches listées sur une fiche
        nearby_count: 6,
    },

    current_node: {
        color: "#F2C84B",
    },
    negative_edge_color: "#E05252AA",
    colors: ["#0887A3", "#F29F05", "#A61F38", "#94A66D", "#8F8EBF", "#002333", "#8C4A0F", "#A563A6"],
    edge_colors: ["#bfe8f2", "#f7ebd4", "#f7dee3", "#e2e8d5", "#d3d3e8", "#1d6e93", "#e59854", "#d7a6d8"],
};
