// Dev mode: edit / delete icons for relations, tags and cards
import config from "./config.js";

const request = async (method, url, body) => {
    const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
};

const create_card_dialog = () => {
    const dialog = document.createElement("dialog");
    dialog.className = "card-dialog";
    dialog.innerHTML = `
        <form method="dialog">
            <h3></h3>
            <p class="file"></p>
            <textarea name="content" spellcheck="false" aria-label="Contenu de la fiche"></textarea>
            <p class="editor-status" role="status"></p>
            <div class="editor-actions">
                <button value="save">Enregistrer</button>
                <button value="cancel" formnovalidate>Annuler</button>
            </div>
        </form>`;
    document.body.append(dialog);
    return dialog;
};

// `kind`: "cards" for a person's card, "tags" for a tag description
const edit_card = async (kind, slug) => {
    const card = await request("GET", `/__dev/${kind}/${slug}`);
    const dialog = document.querySelector(".card-dialog") ?? create_card_dialog();
    const form = dialog.querySelector("form");
    const status = dialog.querySelector(".editor-status");

    const what = kind === "tags" ? "la description du tag" : "la fiche de";
    dialog.querySelector("h3").textContent = `${card.exists ? "Modifier" : "Créer"} ${what} ${card.name}`;
    dialog.querySelector(".file").textContent = card.file;
    form.elements.content.value = card.content;
    status.textContent = "";
    status.classList.remove("error");

    form.onsubmit = async (event) => {
        if (event.submitter?.value !== "save") return;
        event.preventDefault();

        try {
            const result = await request("PUT", `/__dev/${kind}/${slug}`, { content: form.elements.content.value });
            dialog.close();
            if (!window.location.pathname.endsWith(result.url)) {
                window.location.assign(result.url);
            }
        } catch (error) {
            status.textContent = error.message;
            status.classList.add("error");
        }
    };

    dialog.showModal();
    form.elements.content.focus();
};

const actions = {
    "edit-relation": ({ key, tag, to, note }, editor) => editor.edit({ replace: key, tag, to, note }),

    "edit-membership": ({ person, group, note }, editor) =>
        editor.edit({ replace: { person, group }, from: person, tag: config.group_keyword, to: group, note }),

    "delete-membership": async ({ person, group }, editor) => {
        if (!window.confirm(`Retirer le tag « ${group} » de ${person} ?`)) return;
        await request("DELETE", "/__dev/memberships", { person, group });
        editor.set_status(`✔ Tag « ${group} » retiré de ${person}`);
    },

    "delete-group": async ({ slug, name }) => {
        if (!window.confirm(`Supprimer le tag « ${name} » ?\n\nIl sera retiré de toutes les fiches.`)) return;
        const result = await request("DELETE", `/__dev/tags/${slug}`);
        window.location.assign(result.url);
    },

    "delete-relation": async ({ key, label }, editor) => {
        if (!window.confirm(`Supprimer la relation « ${label} » ?`)) return;
        await request("DELETE", "/__dev/relations", { key });
        editor.set_status(`✔ Relation « ${label} » supprimée`);
    },

    "edit-card": ({ kind, slug }) => edit_card(kind, slug),

    "delete-card": async ({ slug, name }) => {
        const message = `Supprimer la fiche de ${name} ?\n\nLes relations vers ${name} écrites dans les autres fiches seront aussi supprimées.`;
        if (!window.confirm(message)) return;
        const result = await request("DELETE", `/__dev/cards/${slug}`);
        window.location.assign(result.url);
    },
};

export default (editor) => {
    document.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button || !actions[button.dataset.action]) return;

        try {
            await actions[button.dataset.action]({ ...button.dataset }, editor);
        } catch (error) {
            editor.set_status(error.message, true);
        }
    });
};
