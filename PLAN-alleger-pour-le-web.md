# Plan — Outil « Alléger pour le web »

## 1. Résumé des demandes

1. Ajouter aux Outils PDF un sixième outil, « Alléger pour le web », qui produit des fichiers **le plus léger possible à la meilleure qualité possible**, pour le futur CV en ligne de JP.
2. Fichiers acceptés : les images (JPG, PNG, WebP, HEIC) et les PDF. **Pas de vidéo** : les vidéos du CV seront intégrées depuis YouTube et les réseaux.
3. Les fichiers sont choisis un par un et **déposés par glisser-déposer**, ou choisis au clic.
4. L'outil **demande où enregistrer** le résultat (dossier choisi dans Chrome, le navigateur de JP).
5. Les originaux ne sont jamais modifiés (fichiers du disque Samsung T5 impossibles à retélécharger).

## 2. Évaluation

| Demande | Nature | Ampleur | Risques |
|---|---|---|---|
| 1. Nouvel outil | Fonctionnalité | `index.html` (vue, tuile, navigation), `app.js` (nouvelle section), `tokens.css` (couleur de l'outil) | Régression sur la navigation des 5 outils existants |
| 2. Encodage AVIF | Fonctionnalité + sécurité | Nouvelle bibliothèque WebAssembly (3,5 Mo), CSP élargie | Chrome ne sait pas produire d'AVIF par lui-même (`toBlob` renvoie du PNG, vérifié) : bibliothèque obligatoire. Encodage lent sur grandes photos |
| 2. PDF | Réutilisation | `lightenPdf()` existante | Aucun nouveau risque |
| 3. Glisser-déposer | Réutilisation | `wireDrop`, `addItems`, `dzError` | — |
| 4. Choix du dossier | Fonctionnalité | `showDirectoryPicker` (Chrome, Edge) | Écrasement d'un fichier du même nom dans le dossier choisi |
| 5. Originaux intacts | Contrainte | Le navigateur n'a aucun droit d'écriture sur un fichier déposé | Risque nul ; seul risque : écraser un fichier du dossier de destination (traité en §4) |

## 3. Hors périmètre

- Vidéo (décision de JP).
- PSD, AI, EPS : à exporter d'abord depuis Photoshop ou Illustrator.
- Optimisation de SVG.
- Génération de plusieurs largeurs par image (`srcset`) : utile pour un site, à proposer plus tard si besoin.
- Intégration des fichiers dans `siteCV` : étape suivante, séparée.
- Les 14 fichiers illisibles de `téléchargement m2A` (scénarios, docx, une vidéo) : ignorés, décision de JP.

## 4. Décisions et arbitrages

**Tranchés par JP**
- Outil web dans `extraire-pages-pdf`, préféré au dashboard du Pi et à un script local.
- Navigateur : Chrome. Pas de vidéo. Pas de copie de sauvegarde sur le Mac.

**Pris seul**
- **Formats de sortie, à cocher (plusieurs possibles)** : AVIF (coché par défaut, le plus léger), WebP (secours pour une balise `<picture>`), JPG (obligatoire pour l'image de partage `og:image` : LinkedIn, Facebook et WhatsApp ne lisent pas l'AVIF).
- **AVIF par `@jsquash/avif` 2.1.1** (libavif/AOM, Apache-2.0, version de mai 2025). Version mono-cœur : la version multi-cœurs exige des en-têtes HTTP que GitHub Pages ne permet pas. Chargée au premier encodage AVIF seulement.
- **WebP et JPG par Chrome lui-même** (`OffscreenCanvas.convertToBlob`) : aucune bibliothèque de plus.
- **Qualité, 3 niveaux** : Très haute, Haute (par défaut), Légère. Correspondance AVIF 70 / 60 / 50, WebP 0,90 / 0,82 / 0,72, JPG 0,92 / 0,85 / 0,78. AVIF en `tune` SSIM, `enableSharpYUV` (contours nets des aplats et des logos), sous-échantillonnage 4:2:0.
- **Taille maximale du grand côté** : 2560, 1920 (par défaut), 1280, 800 px, ou originale. Jamais d'agrandissement.
- **Transparence** conservée en AVIF et WebP ; fond blanc en JPG.
- **Métadonnées et position GPS retirées** (passage par le canvas, comme le Convertisseur).
- **Pas de faux gain** : si un résultat est plus lourd que l'original, il est signalé et n'est pas enregistré.
- **Enregistrement** : `showDirectoryPicker` demande le dossier une fois par lot. Les fichiers y sont écrits directement, sans zip. **Aucun écrasement** : un nom déjà présent devient `nom (2).avif`. Sans cette API (autre navigateur), un `.zip` est téléchargé.
- **Noms de sortie** : `<nom d'origine>.avif`, `.webp`, `.jpg` ; PDF : `<nom>_allégé.pdf` (convention existante).
- **Comparaison avant / après** : pour une image du lot, curseur glissant original contre résultat, à taille réelle, pour juger la qualité avant d'enregistrer.
- **Encodage dans un worker** pour que la page reste réactive, un fichier à la fois, avec progression et bouton Arrêter.
- Couleur de l'outil : nouvelle variable `--tool-web`, choisie dans la charte existante.

## 5. Points de risque

| Risque | Traitement |
|---|---|
| Bibliothèque piégée sur le CDN | Script et WebAssembly téléchargés avec empreinte SRI (`fetch` + `integrity`), comme le worker pdf.js. **Dérisqué par un essai** (voir ci-dessous) |
| CSP élargie | Ajout du seul dossier `https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/` à `connect-src`. Pas d'ajout à `script-src` : le code s'exécute depuis un worker `blob:`, déjà autorisé |
| Lenteur sur grandes photos | Essai : 1,6 s pour 0,4 Mpx. Une photo de 12 Mpx réduite à 1920 px (≈2,5 Mpx) ≈ 10 s. Taille par défaut 1920 px, progression affichée, bouton Arrêter |
| Mémoire (photos de 50 Mpx) | Un fichier à la fois, canvas libérés (`freeCanvas`), bitmap fermés |
| Régression sur les 5 outils | Aucune fonction partagée modifiée : réutilisation seule. Recette des 5 outils avant mise en ligne |
| Écrasement dans le dossier de destination | Nom unique vérifié dans le dossier avant écriture |

**Essai réalisé le 28/10/2026** (code jeté), dans Chrome, sous une CSP identique à celle du projet :
- `og-image.png` du CV, 1200×630, 506 Ko → **AVIF 8,4 Ko** (qualité 60) · 6,4 Ko (qualité 50) · WebP 16,4 Ko.
- `systeme-u-bg.jpg`, 767×500, 304 Ko → **AVIF 33,6 Ko** (qualité 60) · WebP 46,5 Ko.
- Chargement vérifié par SRI puis exécution dans un worker `blob:` : fonctionne.

## 6. Approche technique

- `index.html` : tuile d'accueil, lien de navigation, vue `data-view="web"` (`#web`) sur le modèle de la vue Convertisseur, CSP (`connect-src`).
- `tokens.css` : `--tool-web` et `--on-tool-web` dans les trois blocs (clair, sombre, sombre forcé).
- `app.js` :
  - `VIEWS`, `TITLES`, `TOOL_NAMES` : entrée `web` ;
  - moteur AVIF : chargement vérifié (`fetch` + `integrity`), `WebAssembly.compile`, worker `blob:` (texte du module + code d'appel), `avifEncode(imageData, options)` ;
  - section « Alléger pour le web » : liste (`addItems`), options, traitement fichier par fichier, comparaison, enregistrement dans un dossier.
- Ordre des tranches (risque décroissant) :
  1. Squelette de bout en bout : vue minimale, une image déposée → AVIF enregistré dans un dossier choisi ;
  2. WebP, JPG, niveaux de qualité, taille maximale, PDF ;
  3. Liste, progression, Arrêter, rapport des gains, nom unique ;
  4. Comparaison avant / après ;
  5. Habillage final, tuile, responsive, accessibilité, README.

## 7. Plan de délégation

| # | Tâche | Fichiers | Modèle | Raison | Dépend de |
|---|---|---|---|---|---|
| T1 | Moteur AVIF : chargement SRI, worker `blob:`, `avifEncode()`, ligne CSP | `app.js` (bloc isolé), `index.html` (CSP seule) | opus | Sécurité (SRI, CSP, WebAssembly) et risque de casser le chargement de la page | — |
| T2 | Vue HTML, tuile, navigation, couleur de l'outil | `index.html` (hors CSP), `tokens.css` | sonnet | Gabarit existant à reproduire, périmètre clair | — (en parallèle de T1, fichiers distincts) |
| T3 | Logique de la vue : liste, options, encodage, rapport, enregistrement dans un dossier, comparaison | `app.js` (nouvelle section) | opus | Plus de trois éléments liés, écriture sur disque, réutilisation fine des utilitaires existants | T1, T2 |
| T4 | README : description de l'outil, bibliothèque ajoutée, CSP | `README.md` | haiku | Rédaction bornée, sans jugement | T3 |
| T5 | Recette complète des 6 outils, responsive, console | — | moi | Responsabilité non déléguée | T3, T4 |
| T6 | Audit et mise en ligne | — | agent `evaluateur` du projet | Obligatoire (CLAUDE.md) | T5 |

## 8. Checklist

**Demandes**
- [x] La tuile « Alléger pour le web » apparaît sur l'accueil et dans la navigation, et ouvre `#web`
- [x] Un glisser-déposer de JPG, PNG, WebP, HEIC et PDF les ajoute à la liste ; un autre format est refusé avec un message
- [x] Une image donne un `.avif` valide qui s'ouvre dans Chrome
- [x] WebP et JPG cochés donnent aussi `.webp` et `.jpg`
- [x] Les 3 niveaux de qualité produisent 3 poids différents, du plus lourd au plus léger
- [x] La taille maximale est respectée et une petite image n'est jamais agrandie
- [x] Un PNG transparent reste transparent en AVIF et WebP, et passe sur fond blanc en JPG
- [x] Un PDF avec photos donne `_allégé.pdf` ; un PDF sans photo est signalé « déjà optimisé »
- [x] Le dossier d'enregistrement est demandé et les fichiers y sont écrits
- [x] Un fichier existant du même nom n'est jamais écrasé
- [x] Un résultat plus lourd que l'original est signalé et n'est pas enregistré
- [x] Le poids avant / après et le gain sont affichés pour chaque fichier
- [x] La comparaison avant / après fonctionne au curseur et au clavier
- [x] Le bouton Arrêter interrompt le lot sans bloquer la page
- [x] Les originaux sur le disque ne sont pas modifiés (empreintes avant / après)
- [x] Test réel sur `og-image.png`, `photo-jp.png` et `systeme-u-bg.jpg` du CV : gains relevés

**Référentiel**
- [x] Espacements et couleurs par les variables de `tokens.css` (`1.Regles.md`)
- [x] Aucune donnée de fichier insérée par `innerHTML` (noms échappés, `textContent`)
- [x] SRI sur le script et le WebAssembly AVIF ; CSP élargie au strict nécessaire
- [x] `URL.createObjectURL` toujours suivi de `revokeObjectURL` ; canvas et bitmap libérés
- [x] États vide, en cours, erreur et terminé traités

**Usage réel**
- [x] Mobile 375 px, tablette 768 px, bureau 1280 px : pas de défilement horizontal
- [x] Navigation clavier complète, focus visible (lecteur d'écran non testé : libellés et `aria-live` vérifiés dans le code)
- [x] Thèmes clair et sombre lisibles (contraste ≥ 4,5:1)
- [x] Console sans erreur, aucune ressource en 404
- [x] Les 5 outils existants fonctionnent toujours
- [ ] Validation par l'agent `evaluateur` et vérification en ligne

## 9. Journal de réalisation (28/10/2026)

| Tâche | Modèle prévu | Réalisé par | Écart |
|---|---|---|---|
| T1 Moteur AVIF | opus | opus | Un seul encodage à la fois par rejet explicite plutôt que file d'attente |
| T2 Vue, tuile, couleur | sonnet | sonnet | Grille des tuiles passée à 3 colonnes (768 px) et 6 (1024 px) pour accueillir la 6ᵉ ; couleur terracotta `#c9805e` |
| T3 Logique de la vue | opus | opus | Correction CSS du comparateur en taille réelle ; noms de fichiers assainis (`wSafeName`) ; dépôt global routé vers l'outil |
| T4 README | haiku | haiku | — |
| T5 Recette | moi | moi | Ajout : `app.js?v=6` (cache), mention AVIF dans `'wasm-unsafe-eval'` |

Mesures (qualité Haute, 1920 px) : og-image.png 506 Ko → AVIF 8,4 Ko · WebP 17 Ko · JPG 33 Ko ; photo-jp.png 88 Ko → AVIF 6 Ko ; systeme-u-bg.jpg 304 Ko → AVIF 34 Ko ; photo HEIC iPhone 3024×4032, 1,3 Mo → AVIF 71 Ko · WebP 122 Ko · JPG 268 Ko ; photo JPG 13,8 Mo → AVIF 412 Ko en 2560 px.

Limites connues : l'ajout d'un HEIC de 12 Mpx à la liste fige la page quelques secondes (décodage HEIC existant, dans le fil principal, comme dans le Convertisseur) ; PDF protégé non testé (code existant inchangé) ; mémoire au-delà de 23 Mpx non mesurée.
