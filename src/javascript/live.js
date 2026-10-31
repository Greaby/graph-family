// Mode dev : éditeur de relations + mise à jour en direct quand le site est régénéré
import create_editor from "./editor.js";

const article_selector = "article.column-1";

const mount = (editor) => {
    const article = document.querySelector(article_selector);
    article?.querySelector(".content")?.before(editor.form);
};

// Remplace le contenu de la fiche par sa version régénérée, sans recharger la page
const refresh_article = async (editor) => {
    const response = await fetch(window.location.href, { cache: "no-cache" });
    if (!response.ok) return;

    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const fresh = page.querySelector(article_selector);
    const article = document.querySelector(article_selector);
    if (!fresh || !article) return;

    editor.form.remove();
    article.replaceChildren(...fresh.childNodes);
    mount(editor);
    document.title = page.title;
};

export default (graph) => {
    const title = document.querySelector(`${article_selector} h1`);
    const has_person = document.getElementById("graph-container")?.dataset.node;
    const editor = create_editor(has_person ? title?.textContent.trim() : "");
    mount(editor);

    const events = new EventSource("/__dev/events");

    events.addEventListener("update", async () => {
        await Promise.all([graph?.update(), refresh_article(editor), editor.refresh_persons()]);
    });

    events.addEventListener("error", (event) => {
        if (event.data) {
            editor.set_status(`Erreur de build : ${JSON.parse(event.data).message}`, true);
        }
    });
};
