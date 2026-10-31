// Relation form, only available in dev mode
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

// `defaults`: values kept in the form between two additions
// (on a tag page: the tag keyword and the tag name)
export default (current_name = "", defaults = {}) => {
    const persons_list = element("datalist", { id: "editor-persons" });
    const tags_list = element("datalist", { id: "editor-tags" });
    fill_datalist(tags_list, config.relation_tags ?? []);

    const field = (name, label, attributes = {}) =>
        element("label", { class: "editor-field" }, [
            element("span", {}, [label]),
            element("input", { name, autocomplete: "off", ...attributes }),
        ]);

    const status = element("p", { class: "editor-status", role: "status" });
    const heading = element("h3", { id: "editor-title" }, ["Ajouter une relation"]);
    const submit = element("button", { type: "submit" }, ["Ajouter"]);
    const cancel = element("button", { type: "button", hidden: true }, ["Annuler"]);

    const form = element("form", { class: "editor", "aria-labelledby": "editor-title" }, [
        heading,
        field("from", "Personne", { list: "editor-persons", required: true, value: current_name }),
        field("tag", "Relation", {
            list: "editor-tags",
            required: true,
            placeholder: "parent, ami, -marié, tags…",
            value: defaults.tag,
        }),
        field("to", "Avec", {
            list: "editor-persons",
            required: true,
            placeholder: "Nom Prénom ou nom du tag",
            value: defaults.to,
        }),
        field("note", "Note", { placeholder: "facultatif" }),
        element("div", { class: "editor-actions" }, [submit, cancel]),
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

    // Edit mode: the `key` relation is replaced on save
    let replace = null;

    const reset = () => {
        replace = null;
        heading.textContent = "Ajouter une relation";
        submit.textContent = "Ajouter";
        cancel.hidden = true;
        form.elements.from.value = current_name || (defaults.to ? "" : form.elements.from.value);
        form.elements.to.value = defaults.to ?? "";
        form.elements.note.value = "";
    };

    // `replace`: key of the relation, or { person, group } for a tag
    const edit = ({ replace: replaced, from, tag, to, note }) => {
        replace = replaced;
        heading.textContent = "Modifier la relation";
        submit.textContent = "Enregistrer";
        cancel.hidden = false;
        form.elements.from.value = from || current_name || form.elements.from.value;
        form.elements.tag.value = tag;
        form.elements.to.value = to;
        form.elements.note.value = note ?? "";
        set_status("");
        form.scrollIntoView({ block: "nearest", behavior: "smooth" });
        form.elements.tag.focus();
    };

    cancel.addEventListener("click", () => {
        reset();
        set_status("");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = { ...Object.fromEntries(new FormData(form)), replace };
        const button = submit;
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

            const verb = replace ? "Modifié" : "Ajouté";
            set_status(
                result.changed ? `✔ ${verb} dans ${result.files.join(" et ") || "les fiches"}` : "Cette relation existe déjà"
            );
            reset();
            (defaults.to ? form.elements.from : form.elements.to).focus();
        } catch (error) {
            set_status(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    refresh_persons();

    return { form, refresh_persons, set_status, edit };
};
