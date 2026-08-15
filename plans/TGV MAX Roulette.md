# Plan d'implémentation — « TGV MAX Roulette » (Surprends-moi)

## 1. Objectif / description UX

Fonctionnalité « roulette » : un bouton **« Surprends-moi »** qui, à partir d'une ou plusieurs gares de départ et d'une date déjà choisies par l'utilisateur, sélectionne **au hasard** une destination TGV MAX disponible, puis **anime la carte Leaflet** (vol + zoom `flyTo`) vers la gare tirée, avec sa popup ouverte et son marqueur mis en évidence.

Ce que voit / fait l'utilisateur :

1. En **mode `origin`** (`Mode = 'origin'`), il sélectionne ses gares de départ (`StationMultiSelect`), la plage de dates (`DateRangePicker`) et éventuellement le filtre horaire (`TimeFilter`) — exactement comme aujourd'hui.
2. Dès que des disponibilités sont affichées (`visibleLegs` non vide), un bouton **« Surprends-moi 🎲 »** apparaît dans la barre latérale (à proximité des résultats / de la légende).
3. Au clic : l'app tire une destination aléatoire parmi les destinations effectivement affichées, puis la carte **vole** (`map.flyTo`) vers cette gare à un zoom élevé, ouvre sa popup (détail des trains disponibles : horaires, durée, numéro de train) et **met le marqueur en surbrillance** (couleur distincte du vert « disponible »).
4. Un petit bandeau de confirmation dans la barre latérale indique le résultat : *« Direction : PERPIGNAN — 3 départs dispo »*. L'utilisateur peut re-cliquer pour re-tirer (« relancer la roulette »).
5. Idéal pour un week-end spontané : choisir son départ, laisser le hasard décider de la destination, puis consulter les horaires dans la popup ou la liste.

Note animation : la mécanique existante de focus (`FocusController`, `map.flyTo`, ouverture de popup) est **réutilisée** ; on se contente éventuellement d'augmenter zoom/durée pour un effet plus « surprenant » (cf. §3).

## 2. Scope — données existantes vs nouvelles

**Aucun nouvel appel API n'est nécessaire** pour le cas nominal (mode `origin`). Tout est déjà en mémoire dans `App.tsx` :

- Le chargement des disponibilités est déjà déclenché par le `useEffect` de `src/App.tsx:225` qui appelle `getDestinations(dateFrom, dateTo, codes)` (`src/api/tgvmax.ts:134`) et stocke le résultat dans l'état **`legs`** (`App.tsx:152`, normalisé via `canonicalizeLeg`).
- Le filtre « ce qui est réellement visible » est déjà calculé dans le memo **`visibleLegs`** (`App.tsx:423`). Il applique déjà :
  - le filtre horaire (`timeFilter`, départ ou arrivée) ;
  - l'onglet jour (`legDayTab`) ;
  - **l'exclusion des trains déjà partis aujourd'hui** (`isToday(leg.date) && dep < nowMinutes()`, `App.tsx:430`).

La roulette doit donc consommer **`visibleLegs`** tel quel : une destination tirée dans cet ensemble est *garantie* disponible, dans la fenêtre horaire et non déjà partie.

Références réutilisées pour le tirage :

- `visibleLegs` : `Leg[]` → chaque `leg` expose `destination_iata`, `heure_depart`, `heure_arrivee`, `date`, `train_no` (`src/types.ts:32`).
- Regroupement par destination déjà fait dans `mapPoints` (branche `mode === 'origin'`, `App.tsx:528-546`) via `byDestination` (Map `destination_iata -> Leg[]`). La même logique sert à construire les candidats.
- `getStation(code)` (`src/lib/geo.ts:70`) pour résoudre code → `{name, lat, lon}`.
- `handleSelect(code)` (`App.tsx:483`) / état **`focus`** (`App.tsx:182`) pour le vol de carte : `FocusController` (`src/components/StationMap.tsx:49`) fait déjà `map.flyTo(...)` + `openPopup()`.

Cas où le mode est `destination` : symétrique, on réutiliserait `getOrigins` (`src/api/tgvmax.ts:147`) et la branche `mode === 'destination'` de `mapPoints` (`App.tsx:551-581`) en tirant une **origine** au hasard. Sera traité comme extension optionnelle (cf. §7), pas dans la v1.

Cas `itinerary` : la roulette n'a pas de sens naturel (l'utilisateur doit choisir une arrivée), donc **hors périmètre v1**.

Budget (optionnel, cf. §4 étape 6) : filtrage local sur `visibleLegs` (durée de trajet max via `toMinutes(heure_arrivee) - toMinutes(heure_depart)`, direct-only, etc.) — toujours sans nouvel appel réseau.

## 3. Fichiers impactés

### `src/App.tsx` (principal)

- Ajouter une constante couleur de surbrillance, ex. `const HIGHLIGHT = '#f9ab00'` (à côté de `FIXED`/`AVAILABLE`/`INTERMEDIATE`, `App.tsx:35-37`).
- Ajouter un état **`roulettePick: string | null`** (code de destination tiré) et éventuellement `rouletteLegs: Leg[]` (les legs du tirage, pour le bandeau de confirmation).
- Ajouter un `useCallback` **`rollRoulette`** :
  1. Construire les candidats depuis `visibleLegs` (Map `destination_iata -> Leg[]`, identique à la branche origin de `mapPoints`).
  2. (Optionnel) appliquer un filtre budget (durée max / direct).
  3. Tirer un code au hasard (`Math.random()`), récupérer la station via `getStation`.
  4. `setRoulettePick(code)` + `setFocus({ code, name, lat, lon })` (ou réutiliser `handleSelect(code)`).
  5. Stocker les legs associés pour le bandeau.
- Modifier la branche `mode === 'origin'` de **`mapPoints`** (`App.tsx:518-549`) : lors de la construction des points `AVAILABLE`, si `point.code === roulettePick`, passer `color: HIGHLIGHT` (et garder `count`/`popup` inchangés).
- Rendre le bouton **« Surprends-moi »** dans la barre latérale, visible uniquement en mode `origin` avec `visibleLegs != null && visibleLegs.length > 0` ; `disabled` sinon (comme `button.primary` de la recherche itinéraire, `App.tsx:795-806`).
- Rendre le bandeau de confirmation (résultat du tirage) à côté de la légende (`App.tsx:995-1005`).
- Réinitialiser `roulettePick` à `null` quand les données changent (dans les `useEffect` existants de reset, ex. `App.tsx:437-452` / `handleModeChange` `App.tsx:464`), pour ne pas laisser une surbrillance orpheline.
- Ajouter les nouvelles dépendances aux `useMemo` concernés (`mapPoints` doit dépendre de `roulettePick`).

### `src/components/StationMap.tsx` (léger / optionnel)

- Réutiliser `FocusController` tel quel pour le vol. Option : ajouter des props optionnelles **`focusZoom?: number`** et **`focusDuration?: number`** (défaut : comportement actuel `Math.max(map.getZoom(), 9)` / `0.8`) pour donner à la roulette un zoom/durée plus spectaculaires (`map.flyTo([lat, lon], 10, { duration: 1.4 })`).
- Aucune autre modification : les marqueurs sont déjà des `CircleMarker` réagissant à `color`, et la popup s'ouvre déjà via `markersRef` dans `FocusController`.

### `src/components/` — nouveau composant (optionnel)

- Créer éventuellement **`RouletteButton.tsx`** (ou rester inline dans `App.tsx`) : un bouton stylé « Surprends-moi » + le bandeau résultat. Recommandation : rester **inline** dans `App.tsx` pour limiter la surface (pas de nouvelle API de composant à documenter), sauf si on veut un contrôle de budget dédié (ex. slider « durée max »).

### `src/index.css`

- Ajouter les styles du bouton « surprise » (réutiliser/surclasser `button.primary`, `App.tsx`→ CSS `src/index.css:310-324`) et du bandeau de confirmation (`hint`/`badge`). Pas de nouveaux tokens nécessaires.

### `src/types.ts`

- **Aucun changement requis.** Le `MapPoint` (`src/types.ts:70`) supporte déjà `color`/`popup`/`count` ; le focus est déjà un `MapPoint` partiel. (Optionnel : un type `RouletteResult` local à `App.tsx`, pas nécessaire de le mettre dans `types.ts`.)

### Non modifiés

- `src/api/tgvmax.ts`, `src/lib/itinerary.ts`, `src/lib/geo.ts`, `src/hooks/useGeolocation.ts` : aucune modification (on ne fait que consommer leurs exports existants).

## 4. Étapes d'implémentation (ordonnées)

1. **État + couleur** : dans `App.tsx`, ajouter `const HIGHLIGHT = '#f9ab00'`, les états `roulettePick`/`rouletteLegs`, et les resets dans les effets existants (`handleModeChange` `App.tsx:464`, effet `App.tsx:437`, effet `App.tsx:451`).
2. **Tirage** : implémenter `rollRoulette` (`useCallback`) qui groupe `visibleLegs` par `destination_iata`, exclut éventuellement les candidats hors budget, tire un code, résout `getStation`, positionne `roulettePick` + `setFocus(...)`.
3. **Surbrillance carte** : modifier la branche `origin` de `mapPoints` pour recolorer le point dont le code vaut `roulettePick`, et ajouter `roulettePick` aux dépendances du `useMemo`.
4. **Bouton + bandeau** : rendre le bouton « Surprends-moi » (désactivé si `visibleLegs` vide) et le bandeau de confirmation ; placer le bouton près des résultats/la légende en mode `origin`.
5. **Animation** (optionnel) : ajouter `focusZoom`/`focusDuration` à `StationMap` + `FocusController` pour un vol plus marqué ; les passer depuis `App.tsx` (ou conserver les valeurs par défaut).
6. **Budget (optionnel)** : ajouter un contrôle léger (durée max / « direct uniquement ») filtré dans `rollRoulette`, sans toucher l'API.
7. **CSS** : styler bouton + bandeau dans `index.css`.
8. **Vérification** : `npm run typecheck` et `npm run build` (scripts `package.json`). Test manuel en mode `origin` : départ unique, départs multiples, date du jour, fenêtre horaire restreinte, plage vide.

## 5. Cas limites

- **Aucun résultat** : `legs === null` ou `visibleLegs.length === 0` → bouton `disabled`, aucun tirage (afficher le hint « Aucune disponibilité MAX… » existant).
- **Départs multiples** (`origin.length > 1`) : `visibleLegs` fusionne les legs de tous les codes d'origine (`getDestinations` reçoit `codes = selected.flatMap(s => s.codes)`, `App.tsx:242`). Le tirage reste valide (une destination atteignable depuis *au moins un* des départs) ; le bandeau pourra préciser le(s) départ(s) concerné(s) en lisant `leg.origine`/`origine_iata` du leg choisi.
- **Date = aujourd'hui** : déjà géré par `visibleLegs` (`App.tsx:430` retire les trains partis). Le tirage ne peut donc pas tomber sur un train déjà parti. Vérifier le cas où *tous* les trains du jour sont partis → `visibleLegs` vide → bouton désactivé.
- **Géolocalisation vide / échec** : la roulette ne dépend pas de `useGeolocation` ; si `origin` est vide, `legs` reste `null` (`App.tsx:233`) et le bouton n'apparaît pas. Aucun impact.
- **Onglet jour actif** (`legDayTab !== 'all'`) : le tirage respecte le jour affiché puisque `visibleLegs` est déjà filtré par jour.
- **Re-tirage sur la même gare** : cas possible (probabilité faible) ; prévoir éventuellement de relancer l'animation quand même (`focus` change d'identité → le `useEffect` de `FocusController` rejoue si on force un nouvel objet focus, cf. `App.tsx:52` : dépend de `focus`). Pour forcer un re-vol sur un même code, stocker un compteur/`rouletteToken` dans l'état focus (ou accepter le non-vol si gare identique — à trancher, cf. §7).
- **Mode `destination` / `itinerary`** : bouton non rendu (hors périmètre v1).

## 6. Estimation d'effort et risques

**Effort : S** (petit).

- La majeure partie du travail est du câblage dans `App.tsx` (un état + un handler + un rendu conditionnel) ; aucune nouvelle donnée, aucune nouvelle dépendance.
- Surbrillance + vol réutilisent des mécanismes existants (`focus`, `FocusController`, `color` du `MapPoint`).
- L'ajout d'un budget ou d'un composant dédié ferait monter le ticket vers **S/M**.

**Risques :**

- **UX du hasard** : tirer une destination sans montrer « ce qui a été écarté » peut frustrer ; mitigé par le re-tirage et le bandeau de confirmation. Prévoir un moyen simple de re-cliquer.
- **Biais statistique** : si on tire parmi les *legs* (et non les *destinations distinctes*), les gares avec beaucoup de départs sont sur-représentées. Recommandation : tirer parmi les **destinations distinctes** (tirage uniforme), sauf choix contraire (cf. §7).
- **Animation mobile** : `flyTo` est déjà utilisé ; augmenter durée/zoom peut être moins fluide sur mobile. Conserver des valeurs raisonnables ou réutiliser les valeurs par défaut.
- **Surbrillance persistante** : risque de laisser un marqueur orange après un changement de date ; à neutraliser via les resets de `roulettePick`.
- **Re-tirage même gare** : pas de re-vol si `focus` référence le même code (voir `FocusController` `App.tsx`/`StationMap.tsx:52`). Ajouter un `rouletteToken` si l'on veut relancer l'animation à coup sûr.

## 7. Questions ouvertes

1. **Tirage uniforme par destination distincte ou pondéré par nombre de départs ?** (recommandé : uniforme par destination).
2. **Faut-il un « budget » en v1** (durée max, départ après X h, direct uniquement) ou le filtre horaire existant suffit-il ?
3. **Portée symétrique en mode `destination`** (« surprends-moi une origine ») : à inclure en v1 ou en suivi ?
4. **Comportement du re-tirage sur la même gare** : relancer le vol quand même (nécessite un `rouletteToken` dans l'état focus) ou ignorer ?
5. **Placement du bouton** : dans la barre latérale (à côté de la légende) ou en overlay flottant sur la carte (`map-wrap`, à la manière de `map-toggle` `App.tsx:1018`)?
6. **Pop-up** : ouvrir automatiquement la popup du marqueur tiré (comportement `FocusController` actuel) ou afficher uniquement le bandeau latéral ?
