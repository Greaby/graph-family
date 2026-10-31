// Formulaire d'ajout de relation, disponible uniquement en mode dev
import config from "./config.js";

const element = (tag, attributes = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
        if (value === true) node.setAttribute(key, "");
        else if (value !== false && value != null) node.setAttribute(key, value);
    });
    node.append(...children);
    return node;
};

const fill_datalist = (datalist, options) => {
    datalist.replaceChildren(
        ...options.map(({ value, label }) => element("option", { value, label: label ?? false }))
    );
};

export const load_persons = async () => {
    const response = await fetch("./search.json", { cache: "no-cache" });
    return response.ok ? response.json() : [];
};

export default (current_name = "") => {
    const persons_list = element("datalist", { id: "editor-persons" });
    const tags_list = element("datalist", { id: "editor-tags" });
    fill_datalist(tags_list, config.relation_tags ?? []);

    const field = (name, label, attributes = {}) =>
        element("label", { class: "editor-field" }, [
            element("span", {}, [label]),
            element("input", { name, autocomplete: "off", ...attributes }),
        ]);

    const status = element("p", { class: "editor-status", role: "status" });

    const form = element("form", { class: "editor", "aria-labelledby": "editor-title" }, [
        element("h3", { id: "editor-title" }, ["Ajouter une relation"]),
        field("from", "Personne", { list: "editor-persons", required: true, value: current_name }),
        field("tag", "Relation", {
            list: "editor-tags",
            required: true,
            placeholder: "parent, ami, -marié…",
        }),
        field("to", "Avec", { list: "editor-persons", required: true, placeholder: "Nom Prénom" }),
        field("note", "Note", { placeholder: "facultatif" }),
        element("button", { type: "submit" }, ["Ajouter"]),
        status,
        persons_list,
        tags_list,
    ]);

    const refresh_persons = async () => {
        const persons = await load_persons();
        fill_datalist(persons_list, persons.map(({ title }) => ({ value: title })));
    };

    const set_status = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const button = form.querySelector("button");
        button.disabled = true;
        set_status("Enregistrement…");

        try {
            const response = await fetch("/__dev/relations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            set_status(result.changed ? `✔ Ajouté dans ${result.file}` : "Cette relation existe déjà");
            form.elements.to.value = "";
            form.elements.note.value = "";
            form.elements.to.focus();
        } catch (error) {
            set_status(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    refresh_persons();

    return { form, refresh_persons, set_status };
};
