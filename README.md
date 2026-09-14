# Millefeuille

[![Tests et déploiement](https://github.com/VincentGuyader/millefeuille/actions/workflows/deploy.yml/badge.svg)](https://github.com/VincentGuyader/millefeuille/actions/workflows/deploy.yml)

Un mot, les mesures d'un vieux livre, et Millefeuille vous donne la liste des repères à
tracer sur chaque feuille pour que le mot apparaisse en relief, page après page.

**[Essayer en ligne](https://vincentguyader.github.io/millefeuille/)**, gratuit, rien à
installer, rien n'est envoyé.

![Aperçu du mot Merci vu dans un livre ouvert](docs/apercu.png)

## Comment ça marche

Tout le calcul est écrit en R (`millefeuille.R`) et s'exécute dans votre navigateur
grâce à [webR](https://docs.r-wasm.org/webr/latest/), R compilé en WebAssembly. La page
`index.html` ne fait que dessiner le mot dans la police choisie et afficher le résultat.

Le point que personne ne devine : les feuilles d'un livre ouvert sont réparties
uniformément en angle, pas en largeur. Sans correction, le début et la fin du mot sont
écrasés contre les bords. Millefeuille compense cette ouverture, ce que les patrons du
commerce ne font pas.

Le patron se télécharge en PDF (deux colonnes par page, prêt à imprimer) ou en CSV.

## Lancer en local

```sh
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/`. La première visite télécharge le moteur R
(une dizaine de mégaoctets), les suivantes le trouvent en cache.

## Tester

```sh
Rscript tests/run.R                       # golden master en R natif
cd tests && npm install && npm run webr   # le même dans webR sous node
```

Le détail est dans `CLAUDE.md`.

## Déployer

Chaque push sur `main` lance les tests puis publie le site sur GitHub Pages
(`.github/workflows/deploy.yml`).
