# Graph Family

Générateur de site statique qui transforme des fiches de personnes en un graphe interactif de relations (famille, couples, amis…). Basé sur [Telescope](https://github.com/Greaby/telescope) et [twitter-community](https://github.com/Greaby/twitter-community).

## Installation

Nécessite Node.js 18+.

```bash
npm install
npm run build   # génère le site dans dist/
npm run serve   # le sert en local sur http://localhost:8080
npm test
```

## Créer une fiche

Une fiche par personne dans `data/personnes/`, au format markdown (modèle : `data/template.md`) :

```
# Martin Paul

parent : Martin Jean, Martin Hélène
enfant : Martin Lucas
marié : Roux Camille (depuis 2016)
-marié : Garnier Julie (2005-2014)
ami : Faure Thomas

Texte libre en markdown. On peut citer [[Martin Jean]] pour créer un lien.
```

- Le titre `# ...` donne le nom de la personne (sinon le nom du fichier).
- Juste sous le titre, une ligne par relation : `tag : Nom, Nom`. Une ligne vide termine le bloc ; le reste est le texte de la fiche.
- Une note entre parenthèses après un nom s'affiche sur la fiche : `marié : Roux Camille (depuis 2016)`.
- Une personne citée sans fiche apparaît quand même dans le graphe, avec une page minimale.
- Pas besoin de déclarer une relation des deux côtés : `enfant : B` dans la fiche de A ajoute automatiquement `parent : A` sur la page de B. Si elle est déclarée des deux côtés, elle n'est comptée qu'une fois.

## Relations négatives

Un `-` devant le tag inverse la relation : `-marié`, `-ami`… La relation repousse alors les deux personnes au lieu de les rapprocher dans le graphe. Certains types sont négatifs par défaut (`divorcé`, `ennemi`).

## Configurer les relations

Les types sont définis dans `config.js` (`relations`) :

```js
parent: { label: "Parent", aliases: ["père", "mère"], inverse: "enfant", weight: 3 },
```

- `aliases` : autres tags acceptés dans les fiches
- `inverse` : la relation vue depuis l'autre personne (absent = symétrique)
- `weight` : force d'attraction ; négatif = répulsion

Un tag inconnu est accepté tel quel (symétrique, poids `default_relation_weight`).

## Calcul du graphe

- **Disposition** : ForceAtlas2 sur les liens positifs, pondérés par le poids des relations. Entre chaque lot d'itérations, les paires liées négativement sont écartées jusqu'à `graph.negative_distance` fois la longueur médiane des liens.
- **Taille des nœuds** : PageRank pondéré.
- **Couleurs** : communautés détectées par Louvain.
- **Personnes proches** : les plus proches voisins dans la disposition (kd-tree), listés sur chaque fiche.

La disposition est déterministe (`seed` dans la config).

## Déploiement

Chaque push sur `main` génère le site et le publie sur GitHub Pages (`.github/workflows/deploy.yml`). Dans les paramètres du dépôt, *Settings → Pages → Source* doit être sur **GitHub Actions**.
