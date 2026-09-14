# Plieur

Tu reprends un projet en cours. Lis ce fichier avant de toucher au code.

## Le produit

Site public, gratuit, en français, qui génère le patron de pliage d'un mot dans un livre.
L'utilisateur donne un mot et les caractéristiques de son livre, il repart avec la liste
des repères à tracer sur la tranche de chaque feuille, en millimètres depuis le haut.

Le public visé ne connaît rien à la technique : ce sont des gens qui veulent offrir un
objet fait main. Ils ne savent pas ce qu'est un raster, une projection ou un run.

## L'état du dépôt

```
index.html                      la page : mise en page, dessin du mot, affichage
plieur.R                        tout le calcul, en R de base
tests/                          golden master et vérifications (voir plus bas)
.github/workflows/deploy.yml    tests puis déploiement GitHub Pages
```

Le calcul tourne en R dans le navigateur, grâce à webR (R compilé en WebAssembly),
chargé depuis le CDN officiel `https://webr.r-wasm.org/v0.6.0/` avec une version
épinglée. La page ne fait que deux choses autour : dessiner le mot dans une police
(le canvas sert de moteur de fontes et fournit une matrice de pixels) et afficher le
résultat. **Aucune règle métier ne doit revenir en JavaScript.** Ce choix a été fait
sciemment le 2026-09-14, après une première version toute en JavaScript : le prix
est un téléchargement d'une dizaine de mégaoctets à la première visite, ensuite mis en
cache par le navigateur.

Conséquences à connaître :

- Le canal de communication avec webR est `PostMessage` (`channelType: 3`). Il ne
  demande aucun en-tête COOP/COEP, ce que GitHub Pages ne saurait pas fournir. Ne pas
  passer au canal SharedArrayBuffer.
- La page doit être servie par HTTP (elle charge `plieur.R` par `fetch`). En local :
  `python3 -m http.server 8000` à la racine, puis `http://localhost:8000/`.
- Pas de build, pas de dépendance npm côté site, pas de framework. CSS dans un
  `<style>`, JavaScript dans une IIFE en bas de page. Garde cette contrainte.
- Un objet JavaScript imbriqué ne se convertit pas tout seul en liste R (webR essaie
  d'en faire un data.frame et échoue). Passer par `new shelter.RList(obj)`, comme le
  fait `compute()`.
- Un texte R qui commence par un BOM perd ce BOM au passage vers JavaScript. C'est
  pour ça que le CSV transite en octets (`charToRaw`).
- Le téléchargement part après un `await` : le navigateur n'accepte un `a.click()`
  programmé que quelques secondes après le clic de l'utilisateur. `make_pdf()` est
  écrit pour rester bien en dessous (environ 0,5 s pour 1800 repères dans webR),
  ne pas y réintroduire de boucle par ligne coûteuse.

## L'architecture du calcul (plieur.R)

`build(cfg, glyph)` enchaîne :

- `sample_u(n, angle_deg, mode)` donne la position horizontale normalisée de chaque
  feuille. **C'est la partie que personne ne devine.** Les feuilles d'un livre ouvert
  sont réparties uniformément en angle, pas en abscisse : leur position visible suit un
  sinus. Sans correction, le début et la fin du mot sont écrasés contre les deux bords.
  Le mode `fan` corrige, le mode `linear` reproduit le défaut des patrons du commerce.
- `wave(n, amp, cycles)` décale verticalement chaque feuille pour faire onduler le mot.
- `ribbon(n, amp, cycles, thick, mirror)` fabrique deux bandes pleines, en haut et en
  bas, dont l'axe suit une sinusoïde. Indépendant du texte, fusionné par OU logique.
- `project_glyph(glyph, u, off, lo, hi)` projette les pixels du mot sur les feuilles.
- `mmf(...)` transforme la matrice binaire en repères : segments continus par colonne
  (`rle`), fusion de ceux qui sont trop proches, rejet de ceux qui sont trop courts,
  plafonnement du nombre de bandes, conversion en millimètres.

Les arrondis reproduisent ceux de JavaScript à l'identique (`js_round`, `to_fixed1`,
`js_num`) : c'est ce qui permet au golden master d'exiger l'égalité stricte, PDF
compris. Ne pas les remplacer par `round()`, qui arrondit les .5 différemment.

Une seule divergence volontaire avec l'ancienne page : quand le mot est vide (ou sans
encre), l'ancienne page ne dessinait rien du tout, vagues comprises ; la version R
garde les vagues. Le golden master n'a pas de cas à mot vide pour cette raison, le
comportement est fixé par un test dédié dans `tests/test-golden.R`.

La page passe le mot dessiné sous forme de liste R (`px`, `x0`, `x1`, `y0`, `y1`), ou
`NA` quand il n'y a pas d'encre : un `null` JavaScript devient `NA` en traversant webR,
pas `NULL`. Le garde de `build()` accepte les deux, garde-le dans cet ordre.

`draw()` dans la page rend l'aperçu, en vue « livre ouvert » ou « à plat ». La vue
livre ouvert est celle qui compte, c'est le rendu réel.

## Les deux contraintes physiques à ne jamais casser

Le pli d'angle simple ne fait ressortir **qu'une seule bande par feuille**, puisque le
relief naît du rabat des deux coins. Le sélecteur « Méthode » pilote `max_marks` :
1 pour le pliage simple, 3 pour la découpe au cutter. Si tu ajoutes un effet qui demande
plusieurs bandes, avertis l'utilisateur comme le fait déjà le bloc `#warn`.

Les lettres percées d'un trou (a, e, o, p) perdent leur contre-forme en pliage simple.
C'est pour ça que les écritures anglaises marchent mieux.

## Le PDF

`make_pdf()` l'écrit à la main, sans bibliothèque : objets PDF, table xref, flux de
contenu en `BT/Tf/Td/Tj`, le tout assemblé en vecteur `raw`. A4, deux colonnes de
56 lignes, Courier pour les chiffres (l'alignement en dépend), Helvetica-Bold pour le
titre, encodage WinAnsi. Tout caractère au-delà de 255 devient `?`.
Si tu touches à la mise en page, regénère un fichier de test et ouvre-le vraiment avant
de valider : une table xref fausse produit un PDF qui s'ouvre chez certains lecteurs et
pas chez d'autres. `qpdf --check` et `mutool draw -F txt` sont de bons juges.

## Les tests

Trois niveaux, du plus rapide au plus complet :

1. `Rscript tests/run.R` (depuis la racine). Golden master : `plieur.R` doit reproduire
   au bit près les résultats de la version JavaScript d'origine, figés dans
   `tests/fixtures/` (repères, totaux, CSV, PDF) pour 23 réglages et 4 glyphes
   synthétiques, dont un cas sans aucun pli et un cas à valeurs négatives. `tests/legacy/` contient la copie de référence de ce JavaScript et le
   générateur des fixtures ; on ne les modifie pas.
2. `cd tests && npm install && npm run webr`. Rejoue le même golden master dans webR
   sous node, c'est-à-dire dans le vrai moteur (R 4.6 en WebAssembly).
3. `npm run e2e` dans `tests/`, avec deux serveurs locaux : l'ancienne page sur le
   port 8801, la nouvelle sur le port 8802. Compare les deux dans chromium, vraies
   polices comprises, et vérifie les exports. L'ancienne page est celle du premier
   commit du dépôt (`04f062e`) :

   ```sh
   git worktree add ../plieur-js 04f062e
   (cd ../plieur-js && python3 -m http.server 8801) &
   python3 -m http.server 8802 &
   cd tests && npm install && npm run e2e
   ```

   Le navigateur est cherché dans le PATH (`chromium`, `google-chrome`), sinon donner
   son chemin dans `CHROME_PATH`. Les exports sont écrits dans un dossier temporaire,
   ou dans `DL` si la variable est définie.

La CI (`deploy.yml`) lance les niveaux 1 et 2, et vérifie que `npm run fixtures`
régénère `tests/fixtures/` à l'identique.

Si tu changes le comportement du calcul volontairement, régénère les fixtures avec
`npm run fixtures` seulement après avoir mis à jour `tests/legacy/plieur-legacy.js` en
conséquence, et dis-le dans la PR.

## Ce qui reste à faire

1. **Les photos de la galerie.** Les six vignettes sont des aperçus calculés. Un commentaire
   HTML indique où remplacer le `<canvas>` par une `<img>`. C'est la priorité : une photo de
   vrai livre posé sur une table vaut dix aperçus abstraits.
2. **La vidéo du tutoriel.** L'emplacement 16/9 attend un `<iframe>` YouTube, déjà en
   commentaire. Trois plans suffisent : le traçage à la bande graduée, un pli d'angle en
   gros plan, le livre terminé qu'on ouvre.
3. Favicon, balises Open Graph, titre de partage.
4. Partage d'un réglage par l'URL (hash), pour que les gens puissent s'envoyer un patron.

## Comment écrire

- Réponds en français, de façon directe et technique avec moi, jamais dans l'interface.
- Aucun jargon dans la page : ni R, ni webR, ni raster, ni rendu, ni algorithme.
  « Compensation de l'ouverture », pas « projection en éventail » ; « moteur de calcul »,
  pas « webR ».
- Pas de tiret cadratin ni demi-cadratin, ni dans le code ni dans tes réponses. Virgules,
  parenthèses, deux-points, point-virgules.
- Pas de tournures en paire du type « deux machins, deux bidules ». C'est une tic de
  rédaction d'IA, je le repère immédiatement.
- En R : accolades partout, arguments nommés au-delà du premier, R de base seulement
  (webR ne charge aucun paquet).
- Propose des options tranchées plutôt que des pistes ouvertes.
- Si tu repères une erreur de conception dans ce qui existe, dis-le et corrige.
