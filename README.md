# Extraire pages PDF

Petit outil Windows pour extraire des pages d'un PDF : on dépose le fichier sur le script, une fenêtre demande les pages, puis où enregistrer.

## Version web

[`index.html`](index.html) fonctionne dans le navigateur, sans rien installer, et va plus loin que le script. L'accueil mène à six outils séparés :

- **Extraire des pages** (`#extraire`) : un PDF, aperçu des pages en vignettes, à cliquer pour garder ou écarter une page et à glisser pour changer l'ordre ; la saisie (`1-3, 5`, `4-2`…) place les pages dans l'ordre tapé ; export en un seul PDF ou un PDF par page (.zip) ;
- **Fusionner** (`#fusionner`) : PDF et images (JPG, PNG, WebP, HEIC) mélangés, à réordonner par la poignée et à tourner d'un quart de tour, assemblés en un seul `fusion.pdf`. Chaque image devient une page, en A4 (orientée comme la photo, centrée, marge d'1 cm) ou à la taille de l'image, avec une couche de texte invisible (OCR) qui rend le texte cherchable et copiable ;
- **Convertisseur** (`#convertir`) : HEIC, JPG, PNG, WebP → JPG, PNG ou PDF ; PDF → une image JPG ou PNG par page ; **PDF allégé** (photos JPEG du PDF réduites à 2000 px et recompressées, texte, liens et formulaires intacts ; un PDF sans photo est signalé « déjà optimisé »). Options selon le format : qualité JPG (élevée à 90 % ou fichier léger), taille maximale (originale, 2000 px, 1200 px), taille de page et OCR, un seul PDF ou un PDF par fichier. Un résultat unique est téléchargé tel quel, plusieurs dans un `.zip`. Des images déposées sur l'accueil ouvrent le Convertisseur ;
- **Alléger pour le web** (`#alleger`) : images (JPG, PNG, WebP, HEIC) et PDF. Formats de sortie à cocher : AVIF (le plus léger), WebP (secours), JPG (image de partage, LinkedIn et WhatsApp ne lisent pas l'AVIF) ; trois niveaux de qualité (Très haute, Haute, Légère) ; taille maximale du grand côté (2560, 1920, 1280, 800 px ou originale, jamais d'agrandissement) ; transparence conservée en AVIF et WebP, fond blanc en JPG ; PDF allégés comme dans le Convertisseur ; Chrome demande un dossier et chaque fichier y est écrit dès qu'il est prêt, sans jamais écraser un fichier existant (`nom (2).avif`) ; un résultat plus lourd que l'original n'est pas enregistré ; poids avant/après et gain affichés ; comparateur avant/après au curseur, en taille ajustée ou réelle ; bouton Arrêter. Sans sélecteur de dossier (autre navigateur), un `.zip` est téléchargé (un résultat unique est téléchargé tel quel) ;
- **PDF → Markdown** (`#markdown`) : convertit un ou plusieurs PDF en `.md` (titres, paragraphes, listes, gras ; en-têtes, pieds et numéros de page retirés), avec OCR automatique (français, anglais) des pages scannées. Une photo ou une image de document est lue directement par OCR. Inspiré du convertisseur du dashboard du Pi, mais tout se fait dans le navigateur.

- **Visionneuse** (`#visionneuse`) : lire un PDF, zoomer, remplir ses champs de formulaire, surligner, dessiner, ajouter du texte ou des notes, annuler, puis télécharger le PDF annoté. Surlignages, dessins et notes sont enregistrés comme de vraies annotations (modifiables dans Acrobat) ; le texte ajouté est inscrit dans la page.

Toute image passe par un canvas avant d'être réenregistrée ou mise en PDF : l'orientation EXIF est appliquée, puis les métadonnées, dont la position GPS, disparaissent. Le décodeur HEIC n'est téléchargé (3 Mo) qu'au premier fichier HEIC. L'OCR lit le texte à l'endroit : une image couchée doit d'abord être tournée.

Sous le résultat d'Extraire, de Fusionner, du Convertisseur (quand il produit un seul PDF) et de la Visionneuse, **Envoyer vers** transmet le PDF obtenu (pages choisies et réordonnées, fusion, annotations et champs remplis) à un autre outil, sans téléchargement. L'outil de départ garde son état.

L'habillage suit la charte « Outils PDF » (crème, vert forêt, ocre, sauge, sable ; DM Serif Display et Jost ; thèmes clair et sombre). Ses variables sont dans [`tokens.css`](tokens.css) : chaque outil garde sa couleur sur sa tuile, sa page et sa zone de dépôt.

Les fichiers ne quittent pas l'ordinateur (pdf-lib, pdf.js, SortableJS, JSZip, Tesseract.js, heic-to, `@jsquash/avif`). Publiée avec GitHub Pages : https://jgrewis.github.io/extraire-pages-pdf/

### Sécurité

- **PDF piégé** : toutes les ouvertures de PDF passent par `openPdf()` dans [`app.js`](app.js), avec `isEvalSupported: false`. C'est le correctif officiel de la faille pdf.js CVE-2024-4367 pour la version 3.11.174 : un PDF malveillant ne peut pas exécuter de code dans la page.
- **Intégrité des bibliothèques (SRI)** : les quatre bibliothèques chargées dans `index.html` portent une empreinte `integrity`, vérifiée auprès des registres cdnjs et jsDelivr. Le worker pdf.js, le script Tesseract et son worker sont téléchargés avec contrôle d'intégrité (`verifiedScriptUrl()`), puis lancés depuis une URL `blob:`. Le décodeur HEIC (`heic-to` 1.5.2, version « csp », module ES, licence LGPL-3.0) est chargé par `<link rel="modulepreload" integrity>` puis `import()`, qui reprend le module déjà vérifié (`loadHeic()`). Un fichier modifié sur le CDN est refusé. L'encodeur AVIF (`@jsquash/avif` 2.1.1, libavif, licence Apache-2.0) est chargé au premier encodage AVIF seulement (3,5 Mo) : son script et son WebAssembly sont téléchargés avec contrôle d'intégrité (`loadAvif()`), puis exécutés dans un worker `blob:` ; la version multi-cœurs n'est pas utilisée car elle exige des en-têtes HTTP que GitHub Pages ne permet pas.
- **Content-Security-Policy** (balise `<meta>` dans `index.html`) : pas de script écrit dans la page ni d'`eval` (`'unsafe-inline'` et `'unsafe-eval'` absents de `script-src`) ; scripts limités aux versions exactes des bibliothèques sur cdnjs et jsDelivr ; envois réseau (`connect-src`) limités aux fichiers de pdf.js, de l'OCR et de l'encodeur AVIF ; `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. Les fichiers ouverts ne peuvent donc pas être envoyés vers un autre site.
- Exceptions assumées : `'wasm-unsafe-eval'` (WebAssembly de l'OCR et de l'encodeur AVIF, n'autorise pas `eval` JavaScript), `data:` dans `connect-src` (le worker OCR lit son WebAssembly ainsi), styles en ligne (`style-src 'unsafe-inline'`, sans exécution de code).
- Limites : le noyau OCR (`tesseract.js-core`, épinglé en 5.1.1) et les données de langue sont chargés par le worker Tesseract lui-même, sans empreinte SRI ; la CSP les restreint à jsDelivr. GitHub Pages ne permet pas de régler les en-têtes HTTP (HSTS, `frame-ancestors`…).
- Le code de la page est dans [`app.js`](app.js) : toute modification se fait là, jamais dans un `<script>` en ligne (la CSP le bloquerait). Pour changer de version d'une bibliothèque, mettre à jour l'URL, l'empreinte `integrity` et la CSP ensemble.

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
