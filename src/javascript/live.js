// Dev mode: relation editor + live update when the site is rebuilt
import config from "./config.js";
import create_editor from "./editor.js";
import init_actions from "./dev_actions.js";

const article_selector = "article.column-1";

const mount = (editor) => {
    const article = document.querySelector(article_selector);
    article?.querySelector(".content")?.before(editor.form);
};

// Replace the card content with its rebuilt version, without reloading the page
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
    const { node, group } = document.getElementById("graph-container")?.dataset ?? {};
    const name = title?.firstChild?.textContent.trim() ?? "";
    // On a tag page the form adds members to the tag
    const editor = group
        ? create_editor("", { tag: config.group_keyword, to: name })
        : create_editor(node ? name : "");
    mount(editor);
    init_actions(editor);

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
