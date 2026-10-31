# Graph Family

A static site generator that turns markdown cards about people into an interactive graph of their relationships (family, couples, friends…). Based on [Telescope](https://github.com/Greaby/telescope) and [twitter-community](https://github.com/Greaby/twitter-community).

The generated site is in French; the relation tags used in the cards are French words too (`parent`, `enfant`, `marié`…). They can be changed in `config.js`.

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev     # dev mode with the editor: http://localhost:8080
npm run build   # build the site into dist/
npm test
```

## Writing a card

One card per person in `data/personnes/`, in markdown (template: `data/template.md`):

```
# Martin Paul

parent : Martin Jean, Martin Hélène
enfant : Martin Lucas
marié : Roux Camille (depuis 2016)
-marié : Garnier Julie (2005-2014)
ami : Faure Thomas

Free markdown text. Mention [[Martin Jean]] to link to their card.
```

- The `# ...` title is the person's name (the file name is used if there is no title).
- Right below the title, one line per relation: `tag : Name, Name`. A blank line ends the block; everything after it is the card's text.
- A note in parentheses after a name is displayed on the card: `marié : Roux Camille (depuis 2016)`.
- A person who is mentioned but has no card still shows up in the graph, with a minimal page.
- A relation only needs to be written on one side: `enfant : B` in A's card automatically adds `parent : A` to B's page. If it is written on both sides, it is only counted once.

## Negative relations

A `-` in front of a tag negates the relation: `-marié`, `-ami`… The relation then pushes the two people apart in the graph instead of pulling them together. Some types are negative by default (`divorcé`, `ennemi`).

## Configuring relation types

Types are defined in `config.js` (`relations`):

```js
parent: { label: "Parent", aliases: ["père", "mère"], inverse: "enfant", weight: 3 },
```

- `label`: label displayed on the cards
- `aliases`: other tags accepted in the cards for this type
- `inverse`: the relation as seen from the other person (missing = symmetric)
- `weight`: attraction strength; negative = repulsion

An unknown tag is accepted as is (symmetric, weighted `default_relation_weight`).

## How the graph is computed

- **Layout**: ForceAtlas2 on the positive edges, weighted by the relation weights. Between each batch of iterations, negatively linked pairs are pushed apart up to `graph.negative_distance` times the median edge length.
- **Node size**: weighted PageRank.
- **Colors**: communities detected with Louvain.
- **Nearby people**: the nearest neighbors in the layout (kd-tree), listed on each card.

The layout is deterministic (`seed` in the config): the same cards always give the same graph.

## Dev mode

`npm run dev` starts a local server that:

- rebuilds the site as soon as a card, a file in `src/` or `config.js` changes, and updates the open page without reloading it;
- shows an **Ajouter une relation** form on every page, with autocompletion for people and relation types. The relation is written to the person's markdown card (created if needed), and the graph animates to its new layout.

Typing `-marié` in the relation field creates a negative relation. If the card already has a line for that tag, the name is appended to it (`parent : A, B`).

Editing is **bidirectional**: the relation is written in both cards, using the inverse type on the other side (`parent : B` in A's card adds `enfant : A` to B's card, creating B's card if needed). Editing or deleting a relation updates both cards, and so does adding or removing relation lines in the card editing dialog. Cards edited outside the dev server (in a text editor) are not synced.

Small icons also let you:

- **edit or delete a relation** (next to each listed person). A relation is removed from every card where it is written, including the other person's card;
- **edit the whole card** (next to the title): the markdown opens in an editing dialog. Changing the title renames the person everywhere: file, relations and `[[Name]]` links in the other cards. For a person who is mentioned but has no card, the same icon creates it;
- **delete the card**: the file is deleted, along with the relations to this person in the other cards.

There is no undo: use git to restore a card (`git checkout data/`).

The server only listens on `127.0.0.1` (configurable with `HOST` and `PORT`). The editor does not exist in the site built by `npm run build`.

## Deployment

Every push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`). In the repository settings, *Settings → Pages → Source* must be set to **GitHub Actions**.

## Project structure

```
config.js               site, relation types and graph settings
build.js                production build (pages + JS/CSS bundle)
data/index.md           home page text
data/personnes/*.md     one card per person
src/generator/          card parsing, graph, layout and page generation
src/dev/                dev server and card editing
src/javascript/         graph, search and dev editor (browser)
src/scss/               styles
src/template.twig       page template
test/                   tests (node --test)
```
