const { UndirectedGraph } = require("graphology");
const forceAtlas2 = require("graphology-layout-forceatlas2");
const random = require("graphology-layout/random");

const BATCH_SIZE = 10;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

// Longueur de référence : médiane des liens positifs, ou à défaut distance
// moyenne au centre (graphe sans liens positifs)
const reference_length = (graph) => {
    const lengths = graph.mapEdges((_e, _a, _s, _t, source, target) =>
        distance(source, target)
    );
    const length = median(lengths);
    if (length > 0) return length;

    const nodes = graph.mapNodes((_n, attributes) => attributes);
    if (!nodes.length) return 1;
    const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
    const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
    return median(nodes.map((n) => distance(n, { x: cx, y: cy }))) || 1;
};

// Écarte les paires reliées négativement jusqu'à une distance cible
const apply_negative_edges = (graph, negatives, distance_factor) => {
    const target = reference_length(graph) * distance_factor;

    negatives.forEach(({ source, target: other, weight }) => {
        const a = graph.getNodeAttributes(source);
        const b = graph.getNodeAttributes(other);

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);

        if (d >= target) return;

        if (d === 0) {
            const angle = Math.random() * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
        }

        // Plus le poids négatif est fort, plus l'écart est appliqué vite
        const strength = Math.min(1, Math.abs(weight) / 4) * 0.5;
        const shift = ((target - d) / 2) * strength;

        graph.mergeNodeAttributes(source, {
            x: a.x - (dx / d) * shift,
            y: a.y - (dy / d) * shift,
        });
        graph.mergeNodeAttributes(other, {
            x: b.x + (dx / d) * shift,
            y: b.y + (dy / d) * shift,
        });
    });
};

// ForceAtlas2 ne gère pas les poids négatifs : les liens positifs attirent via
// ForceAtlas2, les liens négatifs sont appliqués entre chaque lot d'itérations
module.exports = (graph, { iterations = 2000, negative_distance = 4 } = {}) => {
    const layout_graph = new UndirectedGraph();
    const negatives = [];

    graph.forEachNode((node) => layout_graph.addNode(node));
    graph.forEachEdge((_edge, attributes, source, target) => {
        if (attributes.weight > 0) {
            layout_graph.mergeEdge(source, target, { weight: attributes.weight });
        } else if (attributes.weight < 0) {
            negatives.push({ source, target, weight: attributes.weight });
        }
    });

    random.assign(layout_graph, { scale: 100, center: 0 });

    const settings = {
        ...forceAtlas2.inferSettings(layout_graph),
        gravity: 0.8,
        edgeWeightInfluence: 1,
    };

    for (let done = 0; done < iterations; done += BATCH_SIZE) {
        forceAtlas2.assign(layout_graph, {
            iterations: BATCH_SIZE,
            settings,
            getEdgeWeight: "weight",
        });

        if (negatives.length) {
            apply_negative_edges(layout_graph, negatives, negative_distance);
        }
    }

    layout_graph.forEachNode((node, { x, y }) => {
        graph.mergeNodeAttributes(node, { x, y });
    });
};
