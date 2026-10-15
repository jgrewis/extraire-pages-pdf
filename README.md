# Extraire pages PDF

Petit outil Windows pour extraire des pages d'un PDF : on dépose le fichier sur le script, une fenêtre demande les pages, puis où enregistrer.

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
