# Plan — Images (JPG, PNG, HEIC, WebP) et outil Convertisseur

## 1. Résumé des demandes
1. **Fusionner** accepte, mélangés dans une même fusion, des PDF et des images JPG, PNG, HEIC, WebP. Chaque image devient une page.
2. Nouvel outil **Convertisseur** :
   - HEIC → JPG, HEIC → PNG (priorité) ;
   - JPG / PNG / HEIC / WebP → PDF ;
   - JPG ↔ PNG (et WebP → JPG ou PNG) ;
   - PDF → JPG ou PNG (une image par page).
3. **Plusieurs images → PDF** : au choix, un seul PDF dans l'ordre de la liste, ou un PDF par image (.zip).
4. **OCR → PDF cherchable** : l'image reste visible, une couche de texte invisible permet la recherche et le copier-coller. Case « Rendre le texte cherchable (OCR) » cochée par défaut, dans le Convertisseur et dans Fusionner.
5. **Taille de page** des images en PDF : A4 orientée selon la photo, centrée, avec marge (par défaut), ou taille exacte de l'image.
6. **Qualité JPG** : « Qualité élevée » (90 %, par défaut) ou « Fichier léger ».
7. **Noms** : « Fusionner des PDF » devient « Fusionner ». Des images déposées sur l'accueil ouvrent le Convertisseur.
8. **Usages complémentaires retenus** :
   - A. Position GPS et métadonnées retirées à chaque conversion, et c'est affiché ;
   - B. Rotation des images (Convertisseur, Fusionner) ;
   - C. « Envoyer vers » depuis le Convertisseur quand le résultat est un PDF ;
   - D. PDF → Markdown accepte les images (OCR direct → .md) ;
   - E. Redimensionner : taille maximale Originale / 2000 px / 1200 px ;
   - F. Alléger un PDF : ré-encodage de ses photos JPEG (version limitée, voir §3).

## 2. Hors périmètre
- Produire du HEIC (encodage) : aucun outil navigateur fiable, et peu d'usage.
- Formats TIFF, GIF, AVIF, RAW, vidéos et Live Photos.
- Alléger les images non JPEG d'un PDF (PNG internes, dessins vectoriels, polices) : décodage trop risqué dans le navigateur. Un PDF de texte ou de dessins ne rétrécira donc pas.
- Recadrage, filtres, correction de perspective des photos de documents.
- Montée de version de pdf.js ou de Tesseract.

## 3. Décisions et arbitrages
**Tranchés par JP**
- Liste des conversions et ajout du WebP en entrée : validés.
- Plusieurs images → PDF : choix « un seul PDF / un PDF par image (.zip) ».
- OCR en PDF cherchable, cochée par défaut ; dans Fusionner : cochée aussi.
- Taille de page : les deux options, A4 par défaut.
- JPG : 90 % par défaut, option « Fichier léger ».
- Renommage et comportement de l'accueil : validés.
- Usages A à F : tous retenus. F pris dans sa version limitée (photos JPEG du PDF seulement).

**Décisions techniques**
- **HEIC : `heic-to` 1.5.2, version « csp »** (jsDelivr, licence LGPL-3.0, chargée sans modification). Test du 2026-10-16, avec la CSP de l'application : une photo 3024 × 4032 convertie en JPG en 4 à 6 s, couleurs justes, aucune violation CSP. Une empreinte fausse est refusée. Écartés :
  - `heic2any` 0.0.4 : abandonné depuis 2020 ;
  - la version IIFE de heic-to : utilise `new Function`, ce qui obligerait à autoriser `unsafe-eval` ;
  - heic-to 1.6.6 : publié depuis moins de deux semaines.
  Le navigateur de test ne lit pas le HEIC tout seul : la bibliothèque est nécessaire.
- **Chargement de heic-to** : c'est un module ES. Il est chargé avec `<link rel="modulepreload" integrity>` (contrôle SRI), puis `import()`. On ne le charge qu'au premier HEIC (3 Mo), et une seule fois. Pas besoin d'ajouter `blob:` à `script-src`.
- **PDF cherchable** : rendu par pdf-lib (déjà présent). Les mots et leurs positions viennent de Tesseract (vérifié : `blocks → lines → words`, avec bbox et ligne de base). Le texte est écrit en mode de rendu invisible (mode 3), en Helvetica (accents français couverts par WinAnsi). Les caractères hors WinAnsi sont remplacés. Pas de nouvelle bibliothèque.
- **Métadonnées (A)** : toute image passe par un canvas avant d'être réenregistrée ou insérée dans un PDF. Les données EXIF, dont la position GPS, disparaissent. L'orientation EXIF est appliquée avant (`createImageBitmap`).
- **Interface du Convertisseur** : une liste de fichiers (comme Fusionner), puis « Convertir en : JPG · PNG · PDF · PDF allégé ». Seules les options utiles au format choisi apparaissent. « PDF allégé » n'est actif que si la liste contient un PDF. Un seul fichier en sortie : téléchargement direct ; plusieurs : .zip.
- **Couleur du Convertisseur** : un 5ᵉ ton de la charte, à choisir dans `tokens.css` (`--sun` en clair, à ajuster en sombre), avec contraste ≥ 4,5:1 sur la tuile, vérifié dans les deux thèmes.
- **Alléger (F)** : pour chaque image JPEG du PDF (`DCTDecode`, 8 bits, sans `Decode` ni masque), on la décode, on la réduit à 2000 px maximum, puis on la ré-encode à 70 %. Elle n'est remplacée que si le résultat est plus petit. Les JPEG CMJN deviennent RVB. Le texte, les liens et les formulaires restent intacts. Le gain est affiché, ou « déjà optimisé ».

## 4. Points de risque
- **Régression de Fusionner** (élargissement de `mAdd`) : on garde le chemin PDF tel quel ; recette d'une fusion 100 % PDF.
- **Mémoire** : des photos de 12 Mpx en série. On traite un fichier à la fois et on libère canvas et bitmaps (`close()`).
- **Lenteur** : HEIC de 4 à 6 s et OCR de 2 à 5 s par image. On affiche une progression par fichier (« HEIC 2/5 », « OCR 2/5 ») et on bloque le double clic.
- **CSP** : ajout de heic-to dans `script-src`. On vérifie que `connect-src` n'en a pas besoin (preload = requête de script).
- **HEIC exotiques** (rafales, séquences, profondeur) : on prend l'image principale ; en cas d'échec, message clair pour le fichier concerné.
- **Un HEIC sans extension ni type** : détection par le contenu (`isHeic`).
- **Couche OCR mal placée** : vérification par sélection du texte dans la Visionneuse (pdf.js) et par recherche.
- **Alléger** : un PDF au JPEG atypique. On ne touche qu'aux cas sûrs, et on garde l'original si le résultat n'est pas plus petit ou si une image échoue.

## 5. Approche technique
Fichiers : `index.html` (vue, tuile, navigation, CSP), `app.js`, `tokens.css` (couleur du Convertisseur), `README.md`.

Tranches, la plus risquée d'abord :
1. **Socle images** : `isImage`, `isHeic`, `loadImage(file) → ImageBitmap` (HEIC par heic-to), `imageToPdfPage(doc, bitmap, { pageSize, ocr })` avec couche OCR, rotation. Testé seul.
2. **Fusionner** : accepte les images (vignette, rotation, nombre de pages), options taille de page et OCR, renommage, `accept` élargi.
3. **Convertisseur — images** : vue, tuile, navigation, liste, JPG / PNG / PDF, qualité, taille maximale, un ou plusieurs PDF, .zip, mention « position GPS retirée ».
4. **Convertisseur — PDF** : PDF → JPG / PNG par page ; PDF allégé.
5. **Liens** : « Envoyer vers » depuis le Convertisseur, réception dans le Convertisseur depuis les autres outils, dépôt sur l'accueil, Markdown accepte les images.
6. **README**, recette complète.

## 6. Checklist
**Demandes**
- [x] Fusionner : un PDF + un JPG + un PNG + un HEIC + un WebP → un seul PDF, dans l'ordre de la liste
- [x] Fusionner : une fusion 100 % PDF donne le même résultat qu'avant (nombre de pages, contenu)
- [x] Fusionner : avec OCR coché, le texte d'une photo est trouvable par la recherche dans le PDF fusionné
- [x] Convertisseur : HEIC → JPG, dimensions conservées, rendu correct
- [x] Convertisseur : HEIC → PNG
- [x] Convertisseur : HEIC / JPG / PNG / WebP → PDF
- [x] Convertisseur : JPG → PNG et PNG → JPG (fond blanc si transparence)
- [x] Convertisseur : PDF de 3 pages → 3 JPG dans un .zip
- [x] Plusieurs images → un seul PDF (ordre respecté) ou un PDF par image (.zip)
- [x] PDF cherchable : texte sélectionnable et trouvable, placé sur les mots, dans la Visionneuse
- [x] Taille de page A4 (par défaut, orientation selon la photo) et taille de l'image
- [x] JPG : qualité élevée par défaut ; « Fichier léger » donne un fichier plus petit
- [x] « Fusionner des PDF » renommé « Fusionner » (titre, onglet, accueil) ; images déposées sur l'accueil → Convertisseur
- [x] A. Un JPG portant une position GPS n'en a plus après conversion ; la mention est affichée
- [x] A. Une photo avec orientation EXIF sort dans le bon sens
- [x] B. Rotation d'une image visible sur la vignette et appliquée au résultat
- [x] C. « Envoyer vers » depuis le Convertisseur (PDF unique) vers les 4 autres outils
- [x] D. Une photo de document déposée dans PDF → Markdown donne un .md lisible
- [x] E. Taille maximale 1200 px respectée sur une photo de 3024 × 4032
- [x] F. Un PDF contenant des photos est allégé, le texte reste sélectionnable ; un PDF sans photo affiche « déjà optimisé »

**Sécurité**
- [ ] heic-to chargé avec contrôle d'intégrité ; une empreinte fausse est refusée (vérifié au spike, à revérifier par l'évaluateur)
- [x] heic-to non chargé tant qu'aucun HEIC n'est déposé
- [x] CSP : seul ajout, le chemin heic-to 1.5.2 dans `script-src` ; aucune violation en console

**Référentiel et usage réel**
- [x] Espacements et composants existants réutilisés (`fcard`, `dz`, `choice`, `send`, `btn`)
- [x] Couleur du Convertisseur : contraste ≥ 4,5:1 sur la tuile, thèmes clair et sombre
- [x] États gérés : liste vide, fichier refusé (format, illisible), progression, erreur par fichier
- [x] Double clic sur « Convertir » sans double traitement
- [x] Clavier : tous les boutons atteignables, focus visible, libellés des boutons d'icône
- [x] Mobile 375 px, tablette 768 px, desktop 1280 px : pas de défilement horizontal, rien de tronqué
- [x] Nom de fichier très long : pas de débordement
- [x] Console : aucune erreur, aucune 404
- [x] Extraire, Markdown (PDF), Visionneuse : pas de régression
- [x] README mis à jour
