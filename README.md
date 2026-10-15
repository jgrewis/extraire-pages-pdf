# Extraire pages PDF

Petit outil Windows pour extraire des pages d'un PDF : on dépose le fichier sur le script, une fenêtre demande les pages, puis où enregistrer.

## Version web

[`index.html`](index.html) fonctionne dans le navigateur, sans rien installer, et va plus loin que le script. L'accueil mène à quatre outils séparés :

- **Extraire des pages** (`#extraire`) : un PDF, aperçu des pages en vignettes, à cliquer pour garder ou écarter une page et à glisser pour changer l'ordre ; la saisie (`1-3, 5`, `4-2`…) place les pages dans l'ordre tapé ; export en un seul PDF ou un PDF par page (.zip) ;
- **Fusionner des PDF** (`#fusionner`) : plusieurs PDF, à réordonner par la poignée de chaque fichier, assemblés en un seul `fusion.pdf` ;
- **PDF → Markdown** (`#markdown`) : convertit un ou plusieurs PDF en `.md` (titres, paragraphes, listes, gras ; en-têtes, pieds et numéros de page retirés), avec OCR automatique (français, anglais) des pages scannées. Inspiré du convertisseur du dashboard du Pi, mais tout se fait dans le navigateur.

- **Visionneuse** (`#visionneuse`) : lire un PDF, zoomer, remplir ses champs de formulaire, surligner, dessiner, ajouter du texte ou des notes, annuler, puis télécharger le PDF annoté. Surlignages, dessins et notes sont enregistrés comme de vraies annotations (modifiables dans Acrobat) ; le texte ajouté est inscrit dans la page.

Sous le résultat d'Extraire, de Fusionner et de la Visionneuse, **Envoyer vers** transmet le PDF obtenu (pages choisies et réordonnées, fusion, annotations et champs remplis) à un autre outil, sans téléchargement. L'outil de départ garde son état.

L'habillage suit la charte « Outils PDF » (crème, vert forêt, ocre, sauge, sable ; DM Serif Display et Jost ; thèmes clair et sombre). Ses variables sont dans [`tokens.css`](tokens.css) : chaque outil garde sa couleur sur sa tuile, sa page et sa zone de dépôt.

Les fichiers ne quittent pas l'ordinateur (pdf-lib, pdf.js, SortableJS, JSZip, Tesseract.js). Publiée avec GitHub Pages : https://jgrewis.github.io/extraire-pages-pdf/

## Installation

```bash
py -m pip install pypdf
```

(Le script installe `pypdf` tout seul s'il manque.)

## Utilisation

- Glisser-déposer un PDF sur `extraire_pages_pdf.pyw` (ou sur un raccourci vers `pyw.exe "chemin\extraire_pages_pdf.pyw"`).
- Double-cliquer sur le script ouvre un sélecteur de fichier.

Syntaxe des pages :

| Saisie        | Pages exportées              |
|---------------|------------------------------|
| `1-3, 5`      | 1, 2, 3, 5                   |
| `8-`          | de 8 à la fin                |
| `13-14-15-16` | 13, 14, 15, 16               |
| `4-2`         | 4, 3, 2 (ordre inversé)      |

Deux modes : un seul PDF, ou un PDF par page. L'emplacement d'enregistrement est demandé, par défaut le dossier du PDF d'origine.
