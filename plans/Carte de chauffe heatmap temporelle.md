# Plan — Carte de chauffe (heatmap temporelle)

## 1. Objectif / description UX

Ajouter une « carte de chauffe » temporelle : un *timelapse* sur la fenêtre de 30 jours du dataset `tgvmax`, dans lequel le **réseau des disponibilités OUI s'allume et s'étend jour après jour**.

Concrètement :

- Un nouveau mode **« Carte de chauffe »** (4ᵉ onglet de `ModeTabs`, à côté de « Depuis une gare », « Vers une gare », « Itinéraire »).
- Un **scrubber temporel** dans la sidebar, placé sous le sélecteur de gares :
  - un **bouton play/pause** (▶ / ⏸) ;
  - un **slider** mono-poignée (un simple `<input type="range">`, cohérent avec `ItineraryControls.tsx` qui utilise déjà ce pattern) représentant l'index du jour (0…N) ;
  - un **label de date courante** réutilisant `formatDayLabel(iso)` (existant dans `src/App.tsx:76`) ;
  - un **réglage de vitesse** (rapide/normal/lent) et un **toggle « cumulatif »**.
- Ce qui **s'anime** sur la carte (rendu par `StationMap` via `mapPoints`/`mapLines`) :
  - les **gares actives** du jour (celles qui ont au moins un départ ou une arrivée OUI ce jour-là) apparaissent comme marqueurs ;
  - les **polylignes origine → destination** (`MapLine`) relient les paires OD disponibles ce jour-là ;
  - en mode **« cumulatif »**, les gares/lignes s'**accumulent** au fil de l'animation (effet « le réseau s'étend ») ; en mode **« jour par jour »**, seul le jour courant est affiché (effet « le réseau clignote »).
- **Couleur / opacité** : réutiliser la palette existante (`FIXED = '#e3000f'`, `AVAILABLE = '#0f9d58'`, `INTERMEDIATE = '#b26a00'`). L'**intensité** (= nombre de départs OUI du jour) pilote **à la fois la taille du marqueur** (via `markerRadius(count)` déjà présent dans `src/components/StationMap.tsx:76`) **et l'opacité** (`fillOpacity`) : peu de départs → vert pâle/peu opaque, beaucoup de départs → vert plein/rouge (gradient « chaleur »). Les lignes gardent le gris `#9aa4b2` existant, avec `opacity` pondérée par le nombre de trains sur l'OD.

Filtrage optionnel : un champ `StationMultiSelect` (« Gares de départ », réutilisable tel quel) permet de **scoper la vue à une ou plusieurs origines** ; laissé vide → le **réseau France entier** s'affiche.

## 2. Scope : données existantes vs nouveaux appels API

### Données déjà disponibles
- `getDateRange()` (`src/api/tgvmax.ts:90`) donne `{ min, max }` de la fenêtre (30 jours). Aucun changement.
- `getRangeEdges(from, to)` (`src/api/tgvmax.ts:187`) exporte **tous** les trajets OUI sur une plage en CSV (`/exports/csv`), parsé par `parseCsv` → `Edge[]` normalisé avec `date`.
- `getAvailableStations(date)` (`src/api/tgvmax.ts:160`) renvoie `{code,name,count}[]` **par date** (requête groupée `group_by origine`).
- `App.tsx` **cache déjà** les edges par plage dans `edgesCache` (`src/App.tsx:205`, `useRef<Map<string, Edge[]>>`), alimenté par `searchItinerary` (`src/App.tsx:273`).

### Évaluation : `getRangeEdges` (CSV complet) vs `getAvailableStations` (par date)

**Recommandation : `getRangeEdges` sur toute la fenêtre, une seule fois, puis agrégation client-side.** Justification :

1. **Un seul appel HTTP** vs **30 appels** (`getAvailableStations` exige une requête paginée par jour → 30×N requêtes pour un timelapse). Le scrubber ayant besoin de *toutes* les dates de toute façon, un appel unique est nettement supérieur.
2. `getRangeEdges` renvoie des **lignes OD** (`from`/`to`), indispensables pour dessiner les polylignes « réseau » ; `getAvailableStations` ne renvoie que des **origines agrégées** (pas de destination → pas de ligne).
3. `getRangeEdges` n'est **pas filtré par origine** (le `where` ne contient que la plage de dates + `od_happy_card="OUI"`) : un seul fetch alimente **n'importe quelle** sélection d'origine (voire le réseau entier), sans re-fetch quand on change de gare. C'est l'argument décisif pour une heatmap scopable.
4. `getAvailableStations` reste utile uniquement comme **variante allégée « sans lignes »** (compteurs de gares par jour) si le volume CSV s'avère trop lourd ; ce serait le plan B.

### Volume de données & caching
- Volume estimé : ~quelques milliers d'OD par jour × 30 jours → **plusieurs dizaines de milliers de lignes CSV** (quelques Mo). Chargé une seule fois puis parsé en `Edge[]`, c'est acceptable ; le code existant charge déjà une plage 14 jours via `searchItinerary` (plafond `maxSpanDays=14` dans `DateRangePicker`), la heatmap double ce volume → à mesurer.
- **Optimisation proposée** : ajouter un helper dédié `getHeatmapEdges(from, to)` dans `src/api/tgvmax.ts` qui réutilise `parseCsv` mais avec un `select` réduit (`date,origine_iata,destination_iata` seulement, sans noms ni horaires ni `train_no`), pour diviser la taille du CSV par ~2–3 (les horaires/noms sont inutiles pour la carte de chauffe). Le endpoint `/exports/csv` accepte déjà `select` (utilisé par `getRangeEdges`).
- **Caching** : réutiliser le pattern `edgesCache`. Ajouter une entrée dédiée `heatmapCache` (clé `range.min..range.max`, donc `'30j'` pleine fenêtre) **séparée** de `edgesCache` (qui cache par plage arbitraire `dateFrom..dateTo` et inclut horaires/noms). Ne pas mélanger les deux types de données. En option, invalider `heatmapCache` à chaque ouverture du mode si la fenêtre a tourné (comparer `range`).
- **Agrégation** : une fois les edges bruts en mémoire, pré-calculer **une seule fois** (dans un `useMemo`) un `Map<string /*date*/, DayAggregate>` où `DayAggregate = { origins: Map<code,count>, destinations: Map<code,count>, links: Map<'from→to', count> }`. Le scrubber ne fait plus qu'un **lookup O(1)** par frame : aucun recalcul réseau à chaque tick.

## 3. Fichiers affectés

| Fichier | Changement (design, pas de code) |
|---|---|
| `src/types.ts` | Ajouter `Mode` valeur `'heatmap'` (l'union `Mode = 'origin' | 'destination' | 'itinerary'` devient `... | 'heatmap'`). Ajouter des types `DayAggregate`, `HeatmapLink` et, si nécessaire, étendre `MapPoint` avec `opacity?: number` et `intensity?: number`. |
| `src/api/tgvmax.ts` | Ajouter `getHeatmapEdges(from, to): Promise<Edge[]>` (export CSV avec `select` réduit, réutilise `parseCsv` et `dateRangeClause`). Pas de changement sur les fonctions existantes. |
| `src/lib/geo.ts` | Aucun changement attendu (réutilise `getStation`, `canonicalCode`). |
| `src/App.tsx` | Nouvelle branche `mode === 'heatmap'` : état `heatmapOrigin: Station[]`, `heatmapEdges`, `heatmapCache` (useRef), `heatmapIndex`, `heatmapPlaying`, `heatmapSpeed`, `heatmapCumulative`, `heatmapDates: string[]`. Fetch plein-fenêtre dans un `useEffect` dédié. `useMemo` d'agrégation par jour. Étendre `mapPoints`/`mapLines` pour le mode heatmap. Rendu du scrubber + `StationMultiSelect` dans la sidebar. |
| `src/components/HeatmapScrubber.tsx` | **Nouveau composant** : play/pause + slider (index) + label de date (`formatDayLabel`) + vitesse + toggle cumulatif. Gère le `setInterval`/`requestAnimationFrame` avec cleanup. Props contrôlées (index, dates, playing, onChange…). |
| `src/components/StationMap.tsx` | Étendre `MapPoint` → rendre `opacity` (passer à `fillOpacity` du `CircleMarker`). Éventuellement prop `lineOpacity` ou pondération sur `MapLine`. Aucun changement structurel majeur. |
| `src/components/ModeTabs.tsx` | Ajouter le tab `{ mode: 'heatmap', label: 'Carte de chauffe' }` dans `TABS`. |
| `src/index.css` | Styles du scrubber (`.heatmap-scrubber`, bouton play, slider, labels), cohérents avec `.tabs`, `.field`, `.range-thumb`. |

## 4. Étapes d'implémentation (ordonnées)

1. **Types** (`src/types.ts`) : étendre `Mode`, ajouter `DayAggregate` / `HeatmapLink`, étendre `MapPoint` avec `opacity`/`intensity`.
2. **API** (`src/api/tgvmax.ts`) : implémenter `getHeatmapEdges(from, to)` (CSV réduit + `parseCsv`).
3. **Composant scrubber** (`src/components/HeatmapScrubber.tsx`) : UI contrôlée (play/pause, slider indexé sur `heatmapDates`, label date, vitesse, toggle cumulatif) + timer avec cleanup. Pas de logique data (données passées en props).
4. **Tab** (`src/components/ModeTabs.tsx`) : ajouter l'entrée « Carte de chauffe ».
5. **Orchestration** (`src/App.tsx`) :
   - état + `handleModeChange` étendu pour réinitialiser l'état heatmap (comme pour les autres modes, cf. `src/App.tsx:464`) ;
   - `useEffect` de fetch plein-fenêtre (`range.min` → `range.max`) avec cache dédié `heatmapCache` et `cancelled` guard (pattern existant `src/App.tsx:207`) ;
   - `useMemo` d'agrégation `Map<date, DayAggregate>` (canonicalisation via `canonicalCode`, `getStation`) ;
   - `useMemo` du `DayAggregate` affiché selon `heatmapIndex` et `heatmapCumulative` (cumul = union des jours 0..index) ;
   - `mapPoints`/`mapLines` pour `mode === 'heatmap'` (marqueurs + lignes, opacité/intensité par `count`) ;
   - rendu sidebar (sélecteur d'origine optionnel + scrubber + légende).
6. **Carte** (`src/components/StationMap.tsx`) : propager `opacity`/intensité aux marqueurs ; éventuellement pondérer `Polyline` `opacity`.
7. **Styles** (`src/index.css`) : scrubber + légende « chaleur ».
8. **Validation** : `npm run typecheck` (build = `tsc --noEmit && vite build`, cf. `package.json:8`), test manuel du timelapse sur un mois réel, mesure de la taille CSV et du temps de parse.

## 5. Edge cases

- **Chargement des 30 jours** : afficher l'état `loading` existant ; désactiver play tant que `heatmapEdges` est `null`. Gérer l'échec CSV (cf. gestion d'erreur `getRangeEdges` → `setError`). Ne pas bloquer le reste de l'app.
- **Performance** : pré-agréger par jour (lookup O(1) par frame) ; ne **pas** re-canonicaliser à chaque tick ; limiter le nombre de marqueurs/lignes rendus (seuil : si `links.size` dépasse ~800, ne rendre que les OD à `count` élevé, ou passer en mode « gares seules » sans lignes). Le re-render React par frame est OK pour quelques centaines d'éléments ; mesurer avec `React.memo` sur le scrubber.
- **Trains déjà partis (aujourd'hui)** : décision UX à fixer — pour une « carte de chauffe » de l'**offre** du jour, afficher la journée complète (ne pas appliquer `isToday`/`nowMinutes` comme le fait `visibleLegs` `src/App.tsx:430`). Alternative : filtrer le jour courant. À trancher en question ouverte.
- **Origines multiples** : agréger (`count` = somme des départs sur toutes les origines sélectionnées), dédupliquer les destinations (`canonicalCode`), lignes distinctes par paire OD.
- **Fenêtre < 30 jours / jours vides** : dériver `heatmapDates` des dates **réellement présentes** dans les edges (pas un index fixe 0..29) ; sauter les jours sans aucune disponibilité (ou les afficher vides).
- **Courses fetch / changement d'origine** : `cancelled` guard + reset de `heatmapIndex` à 0 et pause du play quand la sélection change.
- **Boucle de lecture** : boucler à la fin (ou s'arrêter sur le dernier jour) ; cleanup du timer à l'unmount ; pause sur interaction manuelle avec le slider.
- **Cache / rotation de fenêtre** : si `range.min`/`range.max` changent entre deux visites, invalider `heatmapCache`.

## 6. Effort estimé & risques

- **Effort : M** (moyen). 1 composant nouveau, 1 helper API, 1 branche de mode dans `App.tsx`, extensions légères de `StationMap`/`types`, CSS. Aucun changement d'architecture ni de backend.
- **Risques** :
  1. **Volume CSV 30 jours** (plusieurs Mo) → parse + mémoire. Atténué par `getHeatmapEdges` (select réduit) et le cache. *À mesurer d'abord.*
  2. **Perf Leaflet** avec des centaines de `CircleMarker` + `Polyline` re-rendus à chaque tick. Atténué par l'agrégation par jour, les seuils de rendu et éventuellement `preferCanvas`.
  3. **Sémantique « heatmap »** : risque de confusion avec la heatmap existante (taille = départs, `README.md` « Heatmap »). Nommer le mode « Carte de chauffe » et documenter la différence.
  4. **`select` réduit non supporté** par `/exports/csv` → repli sur `getRangeEdges` existant (qui marche déjà).

## 7. Questions ouvertes

1. **Nouveau mode dédié vs extension des modes « Depuis/Vers »** : le plan part sur un 4ᵉ onglet. Faut-il plutôt intégrer le scrubber dans les modes existants (moins de surface UI) ?
2. **Vue réseau entier par défaut** (sans origine) : confirmée, ou faut-il imposer au moins une origine ?
3. **Cumulatif par défaut** ou « jour par jour » par défaut ?
4. **Filtrer ou non les trains déjà partis du jour courant** (offre vs restant) ?
5. **Échelle de couleur « chaleur »** : rester vert (`AVAILABLE`) avec opacité, ou introduire un gradient vert→rouge (`INTERMEDIATE`→`FIXED`) pour marquer l'intensité ?
6. **Vitesse de lecture** : une valeur fixe (~600 ms/jour) suffit-elle, ou exposer un réglage ?
7. **Seuils de rendu** (nombre max de lignes/marqueurs) : quels paliers retenir avant dégradation ?
8. **TTL / invalidation du cache** heatmap si l'utilisateur reste ouvert à cheval sur la mise à jour quotidienne du dataset.
