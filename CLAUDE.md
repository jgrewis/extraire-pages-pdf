# Outils PDF — consignes du projet

## Mise en production : passage obligatoire par l'évaluateur

Pousser sur `main` publie le site (GitHub Pages). **Ne jamais pousser soi-même** : toute production est envoyée à l'agent `evaluateur` (`.claude/agents/evaluateur.md`), qui audite le code, teste les fonctionnalités, puis pousse s'il valide.

1. Terminer le développement et le tester soi-même.
2. Envoyer la production à l'agent `evaluateur` avec ce brief :

   ```
   Objet : <ce que fait la production, 1-2 phrases>
   Fonctionnalités à tester :
   - <action> → <résultat attendu>
   - …
   Fichiers touchés : <liste>
   Points sensibles : <bibliothèque ajoutée, CSP modifiée, innerHTML, etc. — ou « aucun »>
   ```

3. Lire son verdict :
   - **VALIDÉ ET MIS EN PRODUCTION** : rapporter à l'utilisateur le commit et la vérification en ligne.
   - **CORRECTIONS DEMANDÉES** : appliquer chaque correction, puis renvoyer la production au même évaluateur (SendMessage) avec la liste des corrections faites. Recommencer jusqu'à validation.
   - **BRIEF INCOMPLET** : compléter le brief et renvoyer.

Transmettre à l'utilisateur les corrections demandées et le verdict final : il ne voit pas le rapport de l'évaluateur.
