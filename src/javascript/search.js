import Fuse from "fuse.js";

const MAX_RESULTS = 8;
const DEBOUNCE_DELAY = 200;

export default async (input, results) => {
    const response = await fetch("./search.json");
    if (!response.ok) {
        throw new Error(`search.json : ${response.status}`);
    }

    const fuse = new Fuse(await response.json(), {
        keys: ["title"],
        threshold: 0.3,
        minMatchCharLength: 2,
        ignoreLocation: true,
    });

    let selected = -1;
    let timeout;

    const items = () => [...results.querySelectorAll("[role=option]")];

    const close = () => {
        results.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        selected = -1;
    };

    const select = (index) => {
        const options = items();
        if (!options.length) return;

        selected = (index + options.length) % options.length;
        options.forEach((option, i) => option.setAttribute("aria-selected", String(i === selected)));
        input.setAttribute("aria-activedescendant", options[selected].id);
    };

    const show = (query) => {
        const options = fuse
            .search(query)
            .slice(0, MAX_RESULTS)
            .map(({ item }, index) => {
                const option = document.createElement("li");
                option.id = `search-result-${index}`;
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");

                const link = document.createElement("a");
                link.textContent = item.title;
                link.href = item.url;
                link.tabIndex = -1;

                option.append(link);
                return option;
            });

        results.replaceChildren(...options);
        results.hidden = false;
        input.setAttribute("aria-expanded", "true");
        selected = -1;
    };

    input.addEventListener("input", () => {
        clearTimeout(timeout);
        const query = input.value.trim();

        if (query.length < 2) {
            close();
            return;
        }

        timeout = setTimeout(() => show(query), DEBOUNCE_DELAY);
    });

    input.addEventListener("keydown", (event) => {
        if (results.hidden) return;

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                select(selected + 1);
                break;
            case "ArrowUp":
                event.preventDefault();
                select(selected - 1);
                break;
            case "Enter": {
                const option = items()[selected === -1 ? 0 : selected];
                if (option) {
                    event.preventDefault();
                    window.location.assign(option.querySelector("a").href);
                }
                break;
            }
            case "Escape":
                close();
                break;
        }
    });

    document.addEventListener("click", (event) => {
        if (!results.contains(event.target) && event.target !== input) {
            close();
        }
    });
};
