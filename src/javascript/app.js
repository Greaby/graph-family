import init_graph from "./graph.js";
import init_search from "./search.js";

const report = (error) => console.error(error);

const container = document.getElementById("graph-container");
if (container) {
    init_graph(container, document.querySelector("input[name=show-negative]")).catch(report);
}

const input = document.querySelector("input[type=search]");
const results = document.getElementById("search-results");
if (input && results) {
    init_search(input, results).catch(report);
}
