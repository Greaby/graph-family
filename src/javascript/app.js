import config from "./config.js";
import init_graph from "./graph.js";
import init_search from "./search.js";

const report = (error) => console.error(error);

const container = document.getElementById("graph-container");
const graph = container
    ? init_graph(container, {
          negative_toggle: document.querySelector("input[name=show-negative]"),
          groups_toggle: document.querySelector("input[name=show-groups]"),
      }).catch(report)
    : Promise.resolve();

const input = document.querySelector("input[type=search]");
const results = document.getElementById("search-results");
if (input && results) {
    init_search(input, results).catch(report);
}

if (config.dev) {
    Promise.all([graph, import("./live.js")])
        .then(([controller, { default: init_live }]) => init_live(controller))
        .catch(report);
}
