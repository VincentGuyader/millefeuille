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
index.html                      tout le site, un seul fichier
.github/workflows/deploy.yml    déploiement GitHub Pages
```

Pas de build, pas de dépendance, pas de CDN, pas de framework. CSS dans un `<style>`,
JavaScript dans une IIFE en bas de page. **Garde cette contrainte.** Elle a été choisie
délibérément : le fichier doit pouvoir être ouvert en double-cliquant dessus, et le site
doit survivre dix ans sans maintenance.

Une version antérieure faisait tourner le calcul en R via webR. Elle a été abandonnée :
30 Mo de WebAssembly à télécharger et des en-têtes COOP/COEP à configurer côté serveur,
pour un résultat identique. Ne reviens pas en arrière là-dessus.

## L'architecture du calcul

Le pipeline est dans `build(cfg)` et enchaîne :

- `raster(txt, family, weight)` dessine le mot sur un canvas hors écran et renvoie les
  pixels plus la boîte englobante de l'encre. Le canvas sert uniquement de moteur de fontes.
- `sampleU(n, angle, mode)` donne la position horizontale normalisée de chaque feuille.
  **C'est la partie que personne ne devine.** Les feuilles d'un livre ouvert sont réparties
  uniformément en angle, pas en abscisse : leur position visible suit un sinus. Sans
  correction, le début et la fin du mot sont écrasés contre les deux bords. Le mode `fan`
  corrige, le mode `linear` reproduit le défaut des patrons vendus dans le commerce.
- `wave(n, amp, cycles)` décale verticalement chaque feuille pour faire onduler le mot.
- `ribbon(n, amp, cycles, thick, mirror)` fabrique deux bandes pleines, en haut et en bas,
  dont l'axe suit une sinusoïde. Indépendant du texte, fusionné par OU logique.
- `mmf(...)` transforme la matrice binaire en repères : détection des segments continus
  par colonne, fusion de ceux qui sont trop proches, rejet de ceux qui sont trop courts,
  plafonnement du nombre de bandes, conversion en millimètres.

`draw()` rend l'aperçu, en vue « livre ouvert » ou « à plat ». La vue livre ouvert est
celle qui compte, c'est le rendu réel.

## Les deux contraintes physiques à ne jamais casser

Le pli d'angle simple ne fait ressortir **qu'une seule bande par feuille**, puisque le
relief naît du rabat des deux coins. Le sélecteur « Méthode » pilote `maxMarks` :
1 pour le pliage simple, 3 pour la découpe au cutter. Si tu ajoutes un effet qui demande
plusieurs bandes, avertis l'utilisateur comme le fait déjà le bloc `#warn`.

Les lettres percées d'un trou (a, e, o, p) perdent leur contre-forme en pliage simple.
C'est pour ça que les écritures anglaises marchent mieux.

## Le PDF

Écrit à la main, sans bibliothèque : objets PDF, table xref, flux de contenu en `BT/Tf/Td/Tj`.
A4, deux colonnes de 56 lignes, Courier pour les chiffres (l'alignement en dépend),
Helvetica-Bold pour le titre, encodage WinAnsi. Tout caractère au-delà de 255 devient `?`.
Si tu touches à la mise en page, regénère un fichier de test et ouvre-le vraiment avant
de valider : une table xref fausse produit un PDF qui s'ouvre chez certains lecteurs et
pas chez d'autres.

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
- Aucun jargon dans la page : ni R, ni raster, ni rendu, ni algorithme. « Compensation de
  l'ouverture », pas « projection en éventail ».
- Pas de tiret cadratin ni demi-cadratin, ni dans le code ni dans tes réponses. Virgules,
  parenthèses, deux-points, point-virgules.
- Pas de tournures en paire du type « deux machins, deux bidules ». C'est une tic de
  rédaction d'IA, je le repère immédiatement.
- Propose des options tranchées plutôt que des pistes ouvertes.
- Si tu repères une erreur de conception dans ce qui existe, dis-le et corrige.
