# Millefeuille

Générateur de patrons de pliage de livre : un mot, les mesures du livre, et la liste
des repères à tracer sur chaque feuille.

Le calcul est écrit en R (`millefeuille.R`) et tourne dans le navigateur grâce à webR.
La page `index.html` dessine le mot et affiche le résultat.

## Lancer en local

```sh
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/`. La première visite télécharge le moteur R
(une dizaine de mégaoctets), les suivantes le trouvent en cache.

## Tester

```sh
Rscript tests/run.R          # golden master en R natif
cd tests && npm install && npm run webr   # le même dans webR sous node
```

Le détail est dans `CLAUDE.md`.

## Déployer

Chaque push sur `main` lance les tests puis publie le site sur GitHub Pages
(`.github/workflows/deploy.yml`).
