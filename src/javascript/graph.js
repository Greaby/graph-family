import Graph from "graphology";
import Sigma from "sigma";
import { animateNodes } from "sigma/utils";
import config from "./config.js";

const FADED_COLOR = "#f0f0f0";

const pick = (list, index) => list[index % list.length];

// Rôle de chaque voisin vu depuis `node` (ex: "Parent, -Marié·e")
const edge_label = (graph, edge, node) =>
    graph
        .getEdgeAttribute(edge, "rel")
        .map(([from, label, inverse, negated]) => `${negated ? "-" : ""}${from === node ? label : inverse}`)
        .join(", ");

const fetch_graph_data = async () => {
    const response = await fetch("./graph.json", { cache: "no-cache" });
    if (!response.ok) {
        throw new Error(`graph.json : ${response.status}`);
    }
    return response.json();
};

// Couleurs et tailles d'affichage calculées à partir des données exportées
const decorate = (graph) => {
    graph.updateEachNodeAttributes((_node, attributes) => ({
        ...attributes,
        color: pick(config.colors, attributes.c),
    }));

    graph.forEachEdge((edge, attributes, _source, _target, source_attributes) => {
        const negative = attributes.weight < 0;
        graph.mergeEdgeAttributes(edge, {
            negative,
            size: Math.min(4, Math.max(1, Math.abs(attributes.weight) / 2)),
            color: negative ? config.negative_edge_color : pick(config.edge_colors, source_attributes.c),
        });
    });
};

export default async (container, negative_toggle) => {
    const graph = new Graph();
    graph.import(await fetch_graph_data());
    decorate(graph);

    const find_current_node = () => (graph.hasNode(container.dataset.node) ? container.dataset.node : undefined);
    let current_node = find_current_node();

    let focus = current_node;
    let focus_neighbors = new Set(focus ? graph.neighbors(focus) : []);

    const renderer = new Sigma(graph, container, {
        settings: {
            itemSizesReference: "screen",
            labelRenderedSizeThreshold: 8,
            renderEdgeLabels: true,
        },

        nodeReducer: (node) => {
            const result = {};

            if (node === current_node) {
                result.color = config.current_node_color;
                result.highlighted = true;
                result.zIndex = 2;
            }

            if (focus && node !== focus && !focus_neighbors.has(node)) {
                result.label = "";
                result.color = FADED_COLOR;
                result.zIndex = 0;
            } else if (focus) {
                result.labelVisibility = "visible";
                result.zIndex = Math.max(result.zIndex ?? 0, 1);
            }

            return result;
        },

        edgeReducer: (edge, _data, attributes) => {
            const result = { label: "", labelColor: "#64748b" };

            if (attributes.negative && !negative_toggle?.checked) {
                result.visibility = "hidden";
            }

            if (focus) {
                if (!graph.hasExtremity(edge, focus)) {
                    result.visibility = "hidden";
                } else {
                    result.label = edge_label(graph, edge, focus);
                    result.labelVisibility = "visible";
                }
            }

            return result;
        },
    });

    const set_focus = (node = current_node) => {
        focus = node;
        focus_neighbors = new Set(focus ? graph.neighbors(focus) : []);
        renderer.refresh();
    };

    renderer.on("enterNode", ({ node }) => set_focus(node));
    renderer.on("leaveNode", () => set_focus());
    renderer.on("clickNode", ({ node }) => {
        window.location.assign(`./personne-${encodeURIComponent(node)}.html`);
    });

    negative_toggle?.addEventListener("change", () => renderer.refresh());

    if (current_node) {
        const { x, y } = renderer.viewportToFramedGraph(
            renderer.graphToViewport(graph.getNodeAttributes(current_node))
        );
        renderer.getCamera().setState({ x, y, ratio: 1 });
    }

    // Recharge graph.json en place : les personnes déjà présentes glissent
    // de leur ancienne position vers la nouvelle
    const update = async () => {
        const data = await fetch_graph_data();
        const previous = Object.fromEntries(graph.mapNodes((node, { x, y }) => [node, { x, y }]));

        graph.clear();
        graph.import(data);
        decorate(graph);
        current_node = find_current_node();

        const targets = {};
        graph.forEachNode((node, { x, y }) => {
            targets[node] = { x, y };
            if (previous[node]) {
                graph.mergeNodeAttributes(node, previous[node]);
            }
        });

        set_focus(focus && graph.hasNode(focus) ? focus : current_node);
        animateNodes(graph, targets, { duration: 600 });
    };

    return { renderer, update };
};
