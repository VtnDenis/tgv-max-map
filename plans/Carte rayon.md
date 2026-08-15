# Plan d'implémentation — « Carte rayon »

> Document de conception uniquement. Aucune modification de code.

## 1. Objectif / description UX

Ajouter un nouveau mode `rayon` (« Carte rayon ») qui, depuis la position géolocalisée de l'utilisateur (ou d'une gare choisie manuellement), dessine un cercle de rayon X km sur la carte et liste **toutes les destinations en train direct** atteignables à l'intérieur de ce cercle, à la date sélectionnée.

**Placement du slider de rayon**
- Dans la sidebar (`<aside className="sidebar">`), uniquement quand `mode === 'rayon'`, sous le sélecteur de gare d'origine et le sélecteur de date.
- Slider à **une seule poignée** (valeur unique, ex. 25 → 500 km, pas de 25 km, défaut ~200 km). Affichage de la valeur courante en km.
- Modifier le rayon met à jour **instantanément** (sans nouvel appel API) le cercle et la liste : le filtrage se fait côté client sur les legs déjà chargés (voir §2).

**Rendu du cercle**
- Un cercle Leaflet (overlay `Circle`, non pas un marqueur) centré sur la gare d'origine, rayon = `radiusKm * 1000` mètres, remplissage semi-transparent, contour dans la couleur accent (`#e3000f`).
- Le cercle suit le slider en temps réel.

**Liste des gares atteignables**
- Liste dans la sidebar, triée par distance (croissante), chaque entrée indique : nom de la destination, distance en km, horaires de départ direct.
- Cliquer/tap sur une destination → zoom + ouverture du popup (réutilise le mécanisme `focus` / `handleSelect` existant).
- Un compteur « N destinations dans le rayon » en tête de liste.

**Interaction**
- Gare d'origine : `StationMultiSelect` avec bouton de géolocalisation (réutilise `useGeolocation` + `geoTarget`).
- La sélection d'origine déclenche `getDestinations(date, date, codes)` (aller simple sur la date retenue).
- Cliquer sur un marqueur destination de la carte = même comportement que la liste (zoom + popup).

## 2. Scope : existant vs nouvel appel API

**Réutilisé tel quel (aucun nouvel appel réseau)**
- `getDestinations(from, to, originCodes)` — `src/api/tgvmax.ts:134` : renvoie les `Leg[]` directs (origine → destination) filtrés `od_happy_card="OUI"`. C'est **exactement** ce qu'il faut pour lister les destinations en direct depuis une origine donnée.
- `haversineKm(lat1, lon1, lat2, lon2)` — `src/lib/geo.ts:11` : distance orthodromique pour le filtrage ≤ rayon.
- `getStation(code)` — `src/lib/geo.ts:70` : résout un code `destination_iata` vers `{lat, lon, name}` pour calculer la distance et placer le marqueur.
- `useGeolocation` + `nearestStation` — déjà câblés, fournissent la gare la plus proche.
- `handleSelect` (zoom + popup) et `StationMultiSelect` (sélecteur + bouton géoloc).

**Pourquoi `getDestinations` et pas `getAvailableStations`**
- `getAvailableStations(date)` — `src/api/tgvmax.ts:160` — renvoie les **origines** distinctes (groupées `origine,origine_iata`) et leur `count`, pas les destinations d'une origine donnée. Inadapté ici (on part d'une origine connue et on veut ses destinations).
- `getOrigins` est le symétrique (destinations → origines), non pertinent.
- `getRangeEdges` exporte le graphe complet en CSV (lourd) ; `getDestinations` est plus léger et ciblé.
- Conclusion : **aucun nouvel appel API nécessaire**. `getDestinations(date, date, [origin.code])` avec `from === to === date` retenue.

**Côté client uniquement**
- Filtrage `haversineKm(origin.lat, origin.lon, destStation.lat, destStation.lon) <= radiusKm` sur les destinations uniques des `Leg[]`.
- Les destinations dont `getStation(destination_iata)` renvoie `undefined` (code absent de `stations.json`) sont **ignorées** (pas de coordonnées → pas de distance ni de marqueur).

## 3. Fichiers impactés

- **`src/types.ts`**
  - Étendre `Mode` : `'origin' | 'destination' | 'itinerary' | 'rayon'`.
  - Éventuellement un type d'aide `RadiusCircle = { lat: number; lon: number; radiusKm: number }` (ou le déclarer localement dans `StationMap`).

- **`src/components/ModeTabs.tsx`**
  - Ajouter l'onglet `{ mode: 'rayon', label: 'Carte rayon' }` dans `TABS`.

- **`src/components/StationMap.tsx`**
  - **Confirmer l'overlay cercle** : le fichier importe déjà `CircleMarker` de `react-leaflet` (ligne 3). Il faut importer en plus `Circle` (composant react-leaflet) et le rendre après les `Polyline`/`markers`, avec `center={[lat, lon]}` et `radius={radiusKm * 1000}` (mètres) et `pathOptions={{ color, fillColor, fillOpacity: ~0.12, weight: 2 }}`.
  - Ajouter une prop `radiusCircle?: { lat: number; lon: number; radiusKm: number } | null`.
  - **Couleur/theme** : la couleur du cercle doit rester lisible en clair et en sombre ; utiliser la couleur accent `#e3000f` (identique `FIXED` dans `App.tsx`) ou une couleur dérivée `--accent`. Le remplissage semi-transparent fonctionne sur les deux tuiles (CARTO dark / OSM).
  - **FitBounds** : `FitBounds` calcule `fitBounds` sur `points` (origine + destinations ≤ rayon), donc le cadre englobe déjà les destinations ; le cercle peut déborder légèrement du cadre — acceptable, ou optionnellement `fitBounds` sur `circle.getBounds()` quand `radiusCircle` change (à trancher, voir §7).

- **`src/App.tsx`**
  - Étendre `GeoTarget` : `'origin' | 'from' | 'rayon'` (pour brancher le bouton géoloc du sélecteur rayon).
  - Nouveaux états : `rayonOrigin: Station[]`, `rayonRadius: number` (défaut ~200), `rayonLegs: Leg[] | null`, éventuellement `rayonDate` (ou réutiliser `dateFrom`).
  - `useEffect` dédié (analogue à celui lignes 225-266) : si `mode === 'rayon'` et `rayonOrigin.length > 0`, appeler `getDestinations(date, date, codes)` puis `setRayonLegs(next.map(canonicalizeLeg))`.
  - `useMemo` de filtrage : regrouper `rayonLegs` par `destination_iata`, résoudre `getStation`, filtrer `haversineKm <= rayonRadius`, trier par distance, produire `visibleRayonLegs`.
  - Étendre `mapPoints` et `mapLines` (mêmes `useMemo` que lignes 518-697) pour le cas `mode === 'rayon'` : origine en `FIXED`, destinations dans le rayon en `AVAILABLE` (avec `popup` + `count` comme le mode `origin`), lignes origine→destination.
  - Étendre `handleModeChange` pour réinitialiser les états rayon lors d'un changement de mode.
  - `handleGeolocate` : accepter `'rayon'` et ajouter la gare retournée à `rayonOrigin` (réutilise le `useEffect` lignes 507-516).
  - Rendu sidebar pour `mode === 'rayon'` : `StationMultiSelect` (avec `onGeolocate`), slider de rayon, puis liste des destinations (nouveau composant, voir ci-dessous), compteur, états `loading`/`error`/`geo.state.error` déjà gérés.
  - Passer `radiusCircle` au `<StationMap>` : `{ lat, lon, radiusKm: rayonRadius }` (uniquement quand `rayonOrigin` est défini).

- **`src/components/` (nouveau, optionnel)**
  - `RadiusSlider.tsx` : slider une valeur. `RangeSlider.tsx` (existant) est **bi-poignée** (`value: [number, number]`) donc inadapté ; utiliser un `<input type="range">` natif ou un composant `react-range` mono-valeur. Recommandation : `<input type="range">` (aucune dépendance, style déjà thématé via CSS `--accent`).
  - `RayonList.tsx` : liste triée des destinations dans le rayon (nom, distance km, horaires). Peut réutiliser la mise en page `.result-card` de `ResultsList.tsx`. `LegList` existant n'affiche pas la distance et son tri n'est pas par distance, donc un composant dédié est préférable (ou étendre `LegList` avec une prop `mode: 'rayon'` + distance — à trancher, voir §7).

- **CSS** (fichier de styles existant du projet)
  - Styles slider une valeur + compteur, réutilisant les variables `--accent`, `--border` déjà en place.

## 4. Étapes d'implémentation (ordonnées)

1. Étendre `Mode` dans `src/types.ts` et ajouter l'onglet dans `ModeTabs.tsx`.
2. Ajouter `radiusCircle` + import `Circle` et rendu de l'overlay dans `StationMap.tsx`.
3. Créer le composant slider rayon (`RadiusSlider.tsx` ou input natif).
4. Dans `App.tsx` : nouveaux états (`rayonOrigin`, `rayonRadius`, `rayonLegs`), `useEffect` de chargement via `getDestinations`, `useMemo` de filtrage `haversineKm`.
5. Étendre `GeoTarget` + `handleGeolocate` + l'`useEffect` de géoloc pour alimenter `rayonOrigin`.
6. Étendre `mapPoints` / `mapLines` pour le mode `rayon`, et passer `radiusCircle` à `<StationMap>`.
7. Créer `RayonList.tsx` (liste triée + compteur) et l'afficher dans la sidebar.
8. Étendre `handleModeChange` pour la réinitialisation du mode.
9. Styles CSS (slider + liste + compteur) ; vérifier le rendu clair/sombre.

## 5. Cas limites

- **Géolocalisation refusée** : `geo.state.error` s'affiche déjà (App.tsx:816) ; l'utilisateur peut saisir une gare manuellement dans `StationMultiSelect`. Aucun cercle tant que `rayonOrigin` est vide.
- **Aucune gare d'origine choisie** : ne pas afficher de slider ni de liste ; pas d'appel API (`useEffect` gardé par `rayonOrigin.length === 0`).
- **Rayon = 0** : seule la gare d'origine (distance 0) serait dans le cercle ; plafonner le slider à un `min` > 0 (ex. 25 km) pour éviter un état vide/dégénéré.
- **Aucune gare dans le rayon** : cercle affiché mais liste vide → message « Aucune destination dans ce rayon » (analogue aux `.hint` existants).
- **Trains du jour déjà partis** : filtrer comme `visibleLegs` (App.tsx:423-435) : si `isToday(leg.date)` et `toMinutes(leg.heure_depart) < nowMinutes()`, exclure. Réutiliser la même logique pour ne pas afficher un départ déjà passé.
- **Destination sans coordonnées** (`getStation` → `undefined`) : ignorée, non listée, non marquée (peut faire sous-estimer le compteur ; à mentionner éventuellement).
- **Plusieurs gares d'origine sélectionnées** : `rayonOrigin` peut contenir plusieurs `Station` (le sélecteur est multi). Décision : limiter à une seule origine (clear + set), ou tracer un cercle par origine. Recommandé : une seule origine (comportement le plus simple et le plus lisible).
- **Changement de date** : re-déclencher `getDestinations` (le `useEffect` dépend de la date) ; le filtre rayon s'applique ensuite côté client sans nouvel appel.

## 6. Estimation d'effort et risques

- **Effort : M** (moyen). ~1-2 jours. Majorité côté client (filtrage) ; un seul point d'intégration Leaflet (`Circle`). Pas de nouvel appel API ni de backend.
- **Risques**
  - **Perf API** : `getDestinations` sur une origine à forte activité peut ramener beaucoup de `Leg[]` (ex. Paris) ; le paginement `fetchAllLegs` (offset, LIMIT 100) existe déjà et borne le coût. Attention à ne pas re-fetcher à chaque déplacement du slider (le filtrage est purement client → OK).
  - **Rendu Leaflet** : `Circle` en mètres dépend du zoom ; cohérent avec Leaflet, mais vérifier que le cercle reste visible au zoom par défaut (5) et après `fitBounds`.
  - **Cohérence thème** : couleur du cercle lisible sur CARTO dark comme sur OSM clair.
  - **Multi-origine** : comportement à clarifier (risque de complexité si non tranché tôt).
  - **Date vs plage** : `getDestinations` accepte une plage ; restreindre à une date unique (`from === to`) pour la cohérence avec « à la date sélectionnée ».

## 7. Questions ouvertes

1. **Origine unique ou multiple ?** Limiter `rayonOrigin` à une seule gare (recommandé) ou gérer N cercles ?
2. **Date unique vs plage** : réutiliser `dateFrom` seule, ou conserver la plage `dateFrom..dateTo` (le libellé « à la date sélectionnée » suggère une date unique) ?
3. **Bornes du rayon** : quelles valeurs min/max/pas (ex. 25–500 km, pas 25) et valeur par défaut ?
4. **Couleur du cercle** : réutiliser `#e3000f` (FIXED) ou une nouvelle couleur dédiée (ex. accent bleu) pour distinguer le cercle des marqueurs ?
5. **`fitBounds` sur le cercle** : doit-on re-cadrer la carte pour englober tout le cercle quand le rayon change, ou seulement sur les points (origine + destinations ≤ rayon) ?
6. **`RayonList` dédié vs extension de `LegList`** : liste dédiée avec distance + tri par distance (recommandé) ou extension de `LegList` avec une prop `mode: 'rayon'` ?
7. **Compteur vs destinations non géolocalisées** : afficher un avertissement quand des destinations sont exclues car non présentes dans `stations.json` ?
