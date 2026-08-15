# TGV MAX Map

Application web qui visualise sur une carte de France les disponibilités de places **MAX JEUNE / MAX SENIOR** de la SNCF (offre « TGV MAX »), à partir du jeu de données ouvert [`tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/information/) de SNCF Voyageurs.

> Aucun compte ni clé d'API nécessaire : les jeux de données sont publics et l'API (Opendatasoft Explore v2.1) accepte les requêtes cross-origin.

## Fonctionnalités

Six modes (onglets) :

- **Depuis une gare** — sélectionner une (ou plusieurs) gare(s) de départ : la carte affiche toutes les destinations avec des places MAX disponibles à la date choisie.
  - **Surprends-moi 🎲** : tire une destination au hasard et anime la carte vers elle.
  - **Week-end surprise 🎒** : détecte le prochain week-end (vendredi → dimanche), choisit une destination avec aller direct vendredi soir (≥ 16 h) et retour direct dimanche soir, puis affiche le programme avec carte postale.
- **Vers une gare** — l'inverse : toutes les origines permettant de rejoindre la gare choisie.
- **Itinéraire** — recherche de trajets multi-étapes (jusqu'à 3 trains / 2 correspondances, ou plus en mode « record ») entre plusieurs départs et plusieurs arrivées, avec :
  - onglets de filtrage par nombre de correspondances (direct, 1, 2…) ;
  - tri des résultats (départ, arrivée, durée, correspondances — croissant/décroissant) ;
  - temps de correspondance min/max et nombre de correspondances configurables (sliders) ;
  - mode **aller simple** (plage de dates) ou **aller-retour** (date aller + date retour), avec filtres horaires départ/arrivée **indépendants** par sens et filtrage des retours postérieurs au trajet aller sélectionné ;
  - objectif **« Le plus absurde »** : recherche de l'itinéraire avec le maximum de correspondances (grands détours), avec budget de durée.
- **Carte rayon** — à partir d'une gare d'origine, liste des destinations atteignables en direct selon :
  - un **rayon kilométrique** (cercle + curseur 25–500 km) ;
  - un **halo temporel** (isochrones) : anneaux concentriques 1 h / 2 h / 3 h + gares colorées selon leur temps de trajet direct minimal (curseur 30 min – 5 h).
- **Défis** — six défis calculés à partir de la donnée : destination directe la plus lointaine, trajet direct < 3 h le plus long, destination avec le plus de départs, premier train du jour, destination disponible le plus de jours, et itinéraire le plus long (à la demande).
- **Chauffe** — carte de chauffe temporelle animée (scrubber lecture/pause sur la fenêtre 30 jours), intensité proportionnelle au nombre de trajets, mode cumulatif optionnel.

Et aussi :

- **Tarifs** : fourchette de prix indicative (≈ min–max €) par paire de gares, jointe par code UIC, affichée dans les résultats et les popups.
- **Fréquentation** : nombre de voyageurs/an affiché dans les popups de gare.
- **Ponctualité** : régularité et ponctualité au départ par axe TGV, dans un panneau dépliable.
- **Carte postale** : génération d'une image PNG partageable (canvas) pour un itinéraire ou un week-end (téléchargement + Web Share API).
- **Confettis** : effet de célébration quand un direct part le jour même ; easter egg : code Konami (↑↑↓↓←→←→BA).
- **Recherche multi-jours** : sélection d'une plage de dates (calendrier à double poignée, plafond 14 jours) ; en « Depuis / Vers », onglets par jour pour filtrer les disponibilités.
- **Filtre horaire** : plage de départ **et/ou** d'arrivée (sliders à double poignée) ; si la date du jour est incluse, seuls les trains non encore partis sont affichés.
- **Multi-ville** : bouton « + » pour ajouter autant de gares que souhaité dans chaque champ.
- **Suggestions de proximité** : taper « Paris » suggère aussi Massy TGV, Marne-la-Vallée, Roissy CDG… (rayon de 40 km).
- **Géolocalisation** : bouton 📍 pour sélectionner la gare la plus proche (natif navigateur, HTTPS requis).
- **Carte interactive** : marqueurs, polylignes, popups, clic sidebar → recentrage sur la carte.
- **Sidebar redimensionnable** : poignée de redimensionnement (largeur mémorisée en localStorage, 280–720 px).
- **Responsive mobile** : panneau latéral repliable par-dessus la carte.
- **Mode sombre** (défaut = préférence système, mémorisé).

## Stack technique

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) (tuiles OSM et CARTO dark)
- [react-range](https://github.com/tajo/react-range) (sliders à double poignée)

## Démarrage

```bash
npm install
npm run dev       # http://localhost:5173
```

Autres scripts :

```bash
npm run build           # vérif TypeScript + build de production (dist/)
npm run typecheck       # tsc --noEmit
npm run build:stations  # régénère src/data/stations.json (géocodage + codes UIC)
npm run build:data      # régénère stations.json + prix + fréquentation + régularité
```

## Source de données

- Jeu de données **`tgvmax`** (« Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR »), exposé via l'API **Opendatasoft Explore v2.1** :
  `https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax`
- Fenêtre glissante de **30 jours**, mise à jour quotidienne (le matin).
- Le champ `od_happy_card` (`OUI`/`NON`) est un indicateur **combiné** MAX JEUNE + MAX SENIOR : la donnée ne permet pas de distinguer les deux abonnements.
- Jeu de données **`tarifs-tgv-inoui-ouigo`** : fourchette de prix (min/max) entre paires de gares, jointe par code UIC SNCF (affichée à titre indicatif).
- Jeu de données **`frequentation-gares`** : fréquentation annuelle par gare, jointe par code UIC SNCF.
- Jeu de données **`regularite-mensuelle-tgv-axes`** : régularité et ponctualité mensuelles par axe TGV.

## Géocodage des gares

Le jeu de données ne contient pas de coordonnées. Les gares sont géoréférencées statiquement dans `src/data/stations.json` (343 codes IATA), généré par `scripts/build-stations.mjs` qui croise :

1. les gares distinctes du dataset `tgvmax` ;
2. le référentiel `liste-des-gares` (coordonnées + code UIC) de SNCF ;
3. une table manuelle de secours pour les gares hors référentiel (étranger, « PARIS (intramuros) »…).

Les codes UIC sont rattachés à chaque gare (267 gares ; 8 groupes « (intramuros) » agrègent plusieurs UIC) afin de joindre les jeux tarifs / fréquentation / régularité.

## Structure

```
src/
  api/tgvmax.ts            client Opendatasoft Explore v2.1
  api/cityImages.ts        photos de villes (popups)
  lib/geo.ts               géocodage, lookup, haversine, codes UIC
  lib/itinerary.ts         recherche multi-étapes (BFS) + record de connexions
  lib/challenges.ts        calcul des défis
  lib/fares.ts             fourchette de prix par paire de gares
  lib/frequentation.ts     fréquentation annuelle par gare
  lib/regularite.ts        régularité / ponctualité par axe
  lib/postcard.ts          génération de cartes postales (canvas)
  lib/confetti.ts          confettis (canvas, sans dépendance)
  lib/weekend.ts           détection du prochain week-end
  data/stations.json       gares → lat/lon + UIC
  data/fares.json          paires UIC → { min, max } €
  data/frequentation.json  UIC → voyageurs/an
  data/regularite.json     axe → { regularite, ponctualite }
  hooks/                   useGeolocation, useConfetti, useSameDayCelebration,
                           useKonamiCode
  components/              StationMap, StationMultiSelect, TimeFilter,
                           RangeSlider, RadiusSlider, RayonList, ResultsList,
                           ItineraryControls, DateRangePicker, ModeTabs,
                           ThemeToggle, PostcardModal, ChallengeList,
                           HeatmapScrubber, WeekendProgram, PunctualityPanel,
                           StationPopup
  App.tsx                  orchestration des 6 modes
scripts/                   build-stations / build-fares / build-frequentation /
                           build-regularite (.mjs)
```

## Licence

Données : [Open Database License (ODbL)](https://data.sncf.com/pages/cgu/A1) — SNCF Voyageurs.
