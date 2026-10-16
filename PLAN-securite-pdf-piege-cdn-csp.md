# Plan — Sécurité : PDF piégé, intégrité des bibliothèques, CSP

## 1. Résumé des demandes
1. Empêcher un PDF piégé d'exécuter du code dans la page (faille pdf.js CVE-2024-4367, version 3.11.174).
2. Vérifier l'intégrité (SRI) de toutes les bibliothèques chargées depuis un CDN, y compris celles chargées à la demande (worker pdf.js, Tesseract).
3. Ajouter une Content-Security-Policy qui limite ce que la page peut charger et vers où elle peut envoyer des données.
4. Vérifier que les quatre outils (Extraire, Fusionner, PDF → Markdown avec OCR, Visionneuse) et « Envoyer vers » marchent toujours.

## 2. Hors périmètre
- Montée de version de pdf.js (4.x/5.x) : changement d'API (module ES, nouveau worker), risque de régression sur la visionneuse. Le réglage `isEvalSupported: false` est le correctif officiel de la faille pour la branche 3.x.
- Script Python `extraire_pages_pdf.pyw` : local, non concerné.
- En-têtes HTTP (HSTS, frame-ancestors, nosniff…) : GitHub Pages ne permet pas de les régler ; la CSP passe par une balise `<meta>`, qui ignore `frame-ancestors`.
- Mise en ligne / commit : à faire après validation de la recette.

## 3. Décisions et arbitrages
- **Script principal sorti dans `app.js`** : une CSP stricte interdit le code écrit directement dans la page. Plutôt qu'une empreinte du script (à recalculer à chaque modification, sinon la page casse sans prévenir), le code est déplacé tel quel dans `app.js` et autorisé par `'self'`. Aucune ligne de logique modifiée.
- **Styles en ligne tolérés** (`style-src 'unsafe-inline'`) : la page utilise des attributs `style="…"` ; le risque est faible (pas d'exécution de code) et la CSP bloque déjà les scripts injectés.
- **Empreintes SRI vérifiées à la source** : celles de cdnjs proviennent de l'API officielle cdnjs (sha512), celles de jsDelivr ont été recoupées avec l'API jsDelivr. Les fichiers téléchargés correspondent.
- **Worker pdf.js et worker Tesseract** : téléchargés avec `fetch(…, { integrity })` puis lancés depuis une URL `blob:`, pour que l'intégrité soit vérifiée aussi sur eux.
- **WebAssembly de l'OCR** : `'wasm-unsafe-eval'` autorisé (indispensable à Tesseract). N'autorise pas `eval()` JavaScript.

## 4. Points de risque
- La CSP peut bloquer une ressource oubliée (polices, OCR, données de langue, téléchargements) → recette complète des quatre outils, console surveillée.
- Le noyau OCR (`tesseract.js-core`) et les données de langue sont chargés par le worker Tesseract lui-même : pas de SRI possible sans les héberger. Ils restent limités à jsDelivr par la CSP, et le code OCR n'a pas accès aux autres fichiers ouverts (il ne reçoit que l'image de la page).
- Une empreinte SRI fausse bloque la bibliothèque → vérifié au chargement dans le navigateur.

## 5. Approche technique
Fichiers : `index.html`, nouveau `app.js`, `README.md`.
1. Tranche 1 — `isEvalSupported: false` sur les 4 appels `getDocument`.
2. Tranche 2 — `integrity` + `crossorigin` sur les 4 `<script>` CDN ; worker pdf.js et Tesseract chargés avec contrôle d'intégrité.
3. Tranche 3 — script principal → `app.js` ; balise `<meta http-equiv="Content-Security-Policy">`.
4. Recette dans le navigateur, puis README.

## 6. Checklist
- [x] Les 4 `getDocument` passent `isEvalSupported: false`
- [x] Les 4 `<script>` CDN ont `integrity` + `crossorigin="anonymous"`
- [x] Worker pdf.js chargé avec contrôle d'intégrité
- [x] Tesseract (script + worker) chargés avec contrôle d'intégrité
- [x] Une empreinte volontairement fausse bloque bien le chargement (test de non-régression du contrôle)
- [x] Script principal dans `app.js`, plus aucun script en ligne
- [x] CSP présente : `default-src 'self'`, pas de `'unsafe-inline'` ni `'unsafe-eval'` pour les scripts, `connect-src` limité, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`
- [x] Une requête vers un domaine non autorisé est bien bloquée par la CSP
- [x] Extraire : ouverture, vignettes, sélection, export PDF et .zip
- [x] Fusionner : plusieurs PDF, réordonner, export
- [x] PDF → Markdown : PDF texte + page scannée (OCR), aperçu, téléchargement
- [x] Visionneuse : affichage, zoom, annotation, téléchargement
- [x] « Envoyer vers » entre outils
- [x] Polices DM Serif Display / Jost bien chargées, thèmes clair et sombre
- [x] Console : aucune erreur, aucune violation CSP
- [x] Mobile 375 px : pas de régression d'affichage
- [x] README mis à jour (section sécurité)

## 7. Recette (2026-10-16)
- OCR vérifié sur page rechargée après ajout de `data:` à `connect-src` : page scannée reconnue (« OCR sur 1 p. »), console sans erreur ; un worker `blob:` lit bien un WebAssembly en `data:` sous la CSP.
