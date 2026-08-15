# TGV MAX Map

Application web qui visualise sur une carte de France les disponibilités de places **MAX JEUNE / MAX SENIOR** de la SNCF (offre « TGV MAX »), à partir du jeu de données ouvert [`tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/information/) de SNCF Voyageurs.

> Aucun compte ni clé d'API nécessaire : le jeu de données est public et l'API (Opendatasoft Explore v2.1) accepte les requêtes cross-origin.

## Fonctionnalités

Trois modes :

- **Depuis une gare** — sélectionner une (ou plusieurs) gare(s) de départ : la carte affiche toutes les destinations avec des places MAX disponibles à la date choisie.
- **Vers une gare** — l'inverse : toutes les origines permettant de rejoindre la gare choisie.
- **Itinéraire** — recherche automatique de trajets multi-étapes (jusqu'à 3 trains / 2 correspondances) entre plusieurs départs et plusieurs arrivées, avec :
  - onglets de filtrage par nombre de correspondances (direct, 1, 2…) ;
  - tri des résultats (départ, arrivée, durée, correspondances — croissant/décroissant) ;
  - temps de correspondance min/max et nombre de correspondances configurables (sliders) ;
  - mode **aller simple** (plage de dates) ou **aller-retour** (date aller + date retour), avec filtres horaires départ/arrivée **indépendants** par sens et filtrage des retours postérieurs au trajet aller sélectionné.

Et aussi :

- **Recherche multi-jours** : sélection d'une plage de dates (calendrier à double poignée, plafond 14 jours) ; en « Depuis / Vers », onglets par jour pour filtrer les disponibilités.
- **Filtre horaire** : plage de départ **et/ou** d'arrivée (sliders à double poignée) ; si la date du jour est incluse, seuls les trains non encore partis sont affichés.
- **Durée de trajet** affichée dans les popups et les cartes de résultats.
- **Multi-ville** : bouton « + » pour ajouter autant de gares que souhaité dans chaque champ.
- **Suggestions de proximité** : taper « Paris » suggère aussi Massy TGV, Marne-la-Vallée, Roissy CDG… (rayon de 40 km).
- **Géolocalisation** : bouton 📍 pour sélectionner la gare la plus proche (natif navigateur, HTTPS requis).
- **Heatmap** : taille des marqueurs proportionnelle au nombre de départs vers chaque destination.
- **Carte interactive** : marqueurs, polylignes, popups, clic sidebar → recentrage sur la carte.
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
npm run build        # vérif TypeScript + build de production (dist/)
npm run typecheck    # tsc --noEmit
npm run build:stations  # régénère src/data/stations.json (géocodage)
```

## Source de données

- Jeu de données **`tgvmax`** (« Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR »), exposé via l'API **Opendatasoft Explore v2.1** :
  `https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax`
- Fenêtre glissante de **30 jours**, mise à jour quotidienne (le matin).
- Le champ `od_happy_card` (`OUI`/`NON`) est un indicateur **combiné** MAX JEUNE + MAX SENIOR : la donnée ne permet pas de distinguer les deux abonnements.

## Géocodage des gares

Le jeu de données ne contient pas de coordonnées. Les gares sont géoréférencées statiquement dans `src/data/stations.json` (336 villes / 343 codes IATA), généré par `scripts/build-stations.mjs` qui croise :

1. les gares distinctes du dataset `tgvmax` ;
2. le référentiel `liste-des-gares` (coordonnées) de SNCF ;
3. une table manuelle de secours pour les gares hors référentiel (étranger, « PARIS (intramuros) »…).

## Structure

```
src/
  api/tgvmax.ts            client Opendatasoft Explore v2.1
  lib/geo.ts               géocodage, lookup, haversine, gare la plus proche
  lib/itinerary.ts         recherche multi-étapes (BFS) + durée
  data/stations.json       gares → lat/lon
  hooks/useGeolocation.ts  géolocalisation navigateur
  components/              StationMap, StationMultiSelect, TimeFilter,
                           RangeSlider, ResultsList, ItineraryControls,
                           DateRangePicker, ModeTabs, ThemeToggle
  App.tsx                  orchestration des 3 modes
scripts/build-stations.mjs régénération du géocodage
```

## Licence

Données : [Open Database License (ODbL)](https://data.sncf.com/pages/cgu/A1) — SNCF Voyageurs.
