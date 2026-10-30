import Graph from "graphology";
import Sigma from "sigma";
import Fuse from "fuse.js";
import config from "../../config";

const FADED_COLOR = "#f0f0f0";

const loadSigma = async () => {
    const container = document.querySelector("#graph-container");
    const negative_toggle = document.querySelector("input[name=show-negative]");
    const current_node = container.dataset.node || undefined;

    const data = await fetch("./graph.json").then((response) => response.json());

    const graph = new Graph();
    graph.import(data);

    graph.forEachNode((node, attributes) => {
        graph.mergeNodeAttributes(node, {
            color: config.colors[attributes.c % config.colors.length],
        });
    });

    graph.forEachEdge((edge, attributes, _source, _target, source_attributes) => {
        const negative = attributes.weight < 0;
        graph.mergeEdgeAttributes(edge, {
            negative,
            size: Math.min(4, Math.max(1, Math.abs(attributes.weight) / 2)),
            color: negative
                ? config.negative_edge_color
                : config.edge_colors[source_attributes.c % config.edge_colors.length],
        });
    });

    // Rôle de chaque voisin vu depuis `node` (ex: "Parent, Marié·e")
    const edge_label = (edge, node) =>
        graph
            .getEdgeAttribute(edge, "rel")
            .map(([from, label, inverse, negated]) =>
                `${negated ? "-" : ""}${from === node ? label : inverse}`
            )
            .join(", ");

    let focus = current_node;
    let focus_neighbors = focus ? new Set(graph.neighbors(focus)) : undefined;

    const renderer = new Sigma(graph, container, {
        settings: {
            itemSizesReference: "screen",
            labelRenderedSizeThreshold: 8,
            renderEdgeLabels: true,
        },

        nodeReducer: (node) => {
            const result = {};

            if (node === current_node) {
                result.color = config.current_node.color;
                result.highlighted = true;
                result.zIndex = 2;
            }

            if (focus && node !== focus && !focus_neighbors.has(node)) {
                result.label = "";
                result.color = FADED_COLOR;
                result.zIndex = 0;
            } else if (focus) {
                result.labelVisibility = "visible";
                result.zIndex = Math.max(result.zIndex || 0, 1);
            }

            return result;
        },

        edgeReducer: (edge, _data, attributes) => {
            const result = { label: "", labelColor: "#64748b" };

            if (attributes.negative && !negative_toggle.checked) {
                result.visibility = "hidden";
            }

            if (focus) {
                if (!graph.hasExtremity(edge, focus)) {
                    result.visibility = "hidden";
                } else {
                    result.label = edge_label(edge, focus);
                    result.labelVisibility = "visible";
                }
            }

            return result;
        },
    });

    const set_focus = (node) => {
        focus = node ?? current_node;
        focus_neighbors = focus ? new Set(graph.neighbors(focus)) : undefined;
        renderer.refresh();
    };

    renderer.on("enterNode", ({ node }) => set_focus(node));
    renderer.on("leaveNode", () => set_focus());
    renderer.on("clickNode", ({ node }) => {
        window.location = `./personne-${node}.html`;
    });

    negative_toggle.addEventListener("change", () => renderer.refresh());

    if (current_node && graph.hasNode(current_node)) {
        const { x, y } = renderer.viewportToFramedGraph(
            renderer.graphToViewport(graph.getNodeAttributes(current_node))
        );
        renderer.getCamera().setState({ x, y, ratio: 1 });
    }
};

const loadSearch = async () => {
    const data = await fetch("./search.json").then((response) => response.json());

    const fuse = new Fuse(data, {
        keys: ["title"],
        threshold: 0.3,
        minMatchCharLength: 2,
        ignoreLocation: true,
    });

    const input_search = document.querySelector("input[type=search]");
    const search_results = document.querySelector(".search-results");

    let search_delay = null;
    input_search.addEventListener("input", (event) => {
        clearTimeout(search_delay);
        const query = event.currentTarget.value;

        if (query.length < 2) {
            search_results.classList.remove("active");
            return;
        }

        search_delay = setTimeout(() => {
            search_results.classList.add("active");
            search_results.replaceChildren(
                ...fuse
                    .search(query)
                    .slice(0, 8)
                    .map(({ item }) => {
                        const node = document.createElement("li");
                        const link = document.createElement("a");
                        link.textContent = item.title;
                        link.href = item.url;
                        node.appendChild(link);
                        return node;
                    })
            );
        }, 200);
    });

    document.body.addEventListener("click", () => {
        search_results.classList.remove("active");
    });
    search_results.addEventListener("click", (event) => event.stopPropagation());
};

window.addEventListener("DOMContentLoaded", () => {
    loadSigma();
    loadSearch();
});
