module.exports = {
    base_url: "https://greaby.github.io/graph-family/",
    language: "fr",

    // Random generator seed: same data => same graph
    seed: "graph-family",

    folders: {
        dist: "dist",
        data: "data",
        persons: "data/personnes",
        // Optional description of a tag: data/tags/<slug>.md
        groups: "data/tags",
    },

    labels: {
        project_title: "Graph Family",
        search: "Rechercher",
        relations: "Relations",
        nearby: "Personnes proches",
        missing_card: "Cette personne n'a pas encore de fiche.",
        show_negative: "Afficher les relations négatives",
        show_groups: "Afficher les tags",
        negative: "négatif",
        graph: "Graphe des relations",
        description: "Graphe interactif des relations familiales et amicales",
    },

    // Relation types.
    //
    // - label   : label displayed on the cards
    // - aliases : other tags accepted in the cards for this type
    // - inverse : type as seen from the other person (parent <-> enfant).
    //             Missing = symmetric relation (ami <-> ami).
    // - weight  : attraction strength in the graph. A negative value pushes
    //             both people apart.
    //
    // Prefixing a tag with "-" in a card (e.g. "-marié") makes the relation
    // negative: it repels instead of attracting.
    //
    // An unknown tag is accepted as is: symmetric, weighted
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

    // Tags link people to a shared group (a school, a club, a city…):
    //   tags : École Jules Ferry (1995-2000), Club de foot
    // Each tag is a node of the graph linked to all its members, with its own page.
    groups: {
        keyword: "tags",
        label: "Tags",
        members_label: "Membres",
        weight: 1,
        color: "#94a3b8",
        edge_color: "#e2e8f0",
    },

    graph: {
        node_min_size: 4,
        node_max_size: 18,

        // Target minimum distance (as a multiple of the median positive edge
        // length) between two negatively linked people
        negative_distance: 4,
        layout_iterations: 2000,
        // Number of nearby people listed on a card
        nearby_count: 6,
    },

    current_node: {
        color: "#F2C84B",
    },
    negative_edge_color: "#E05252AA",
    colors: ["#0887A3", "#F29F05", "#A61F38", "#94A66D", "#8F8EBF", "#002333", "#8C4A0F", "#A563A6"],
    edge_colors: ["#bfe8f2", "#f7ebd4", "#f7dee3", "#e2e8d5", "#d3d3e8", "#1d6e93", "#e59854", "#d7a6d8"],
};
