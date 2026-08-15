# Plan — Mode « Trésor / Défis » (gamification)

Document de conception uniquement (aucune modification de code dans ce document).

## 1. Objectif / description UX

Ajouter un mode ludique qui transforme la recherche de disponibilités TGV MAX en une liste de **défis** prédéfinis. Chaque défi pose une question du type « quelle est la destination directe la plus lointaine depuis ma gare ? ». L'app calcule la réponse à partir des données déjà chargées, affiche la station gagnante, et l'épingle sur la carte avec une couleur distincte.

### Où vit le mode

**Nouveau 4ᵉ onglet** dans `ModeTabs` (plutôt qu'une overlay), car :
- le type `Mode` est déjà une union (`'origin' | 'destination' | 'itinerary'` dans `src/types.ts:80`) : il suffit d'y ajouter `'challenges'` ;
- `ModeTabs.tsx` itère sur un tableau `TABS` statique (`src/components/ModeTabs.tsx:13-17`) : ajout trivial d'un label « Défis » ;
- `handleModeChange` (`src/App.tsx:464-474`) remet déjà `legs`, `edges`, `focus`, `error` à `null` proprement à chaque changement de mode → zéro état résiduel.

### UI dans le panneau latéral (sidebar)

Quand `mode === 'challenges'` :
1. **Sélecteur de gare de départ** : réutilisation de `StationMultiSelect` (`src/components/StationMultiSelect.tsx`) avec label « Gare de départ » + bouton géolocalisation (comme `handleGeolocate('origin')`). Les défis dépendent de l'origine choisie (ils sont « depuis ta gare »).
2. **Sélecteur de date** : réutilisation de `DateRangePicker` existant (déjà rendu pour tous les modes). Les défis s'évaluent sur la plage `[dateFrom, dateTo]` sélectionnée.
3. **Liste de défis** : une carte (`result-card`) par défi avec :
   - un titre + une description courte ;
   - un état **non résolu** (indice) quand l'origine n'est pas choisie, **en calcul**, ou **résolu** (pastille ✓ + réponse) ;
   - la réponse affichée : nom de la gare gagnante + métrique (distance en km, durée `formatDuration`, nombre de départs, etc.) ;
   - cliquer sur la carte épingle la station gagnante et `flyTo` dessus (mécanisme `focus` + `MapPoint` déjà en place).

### Rendu carte

- La/les station(s) gagnante(s) sont ajoutées à `mapPoints` (`src/App.tsx:518`) avec une **couleur dédiée** (ex. doré `#f2b705`) distincte de `FIXED`, `AVAILABLE`, `INTERMEDIATE`.
- Optionnellement une `MapLine` entre l'origine et la gagnante pour matérialiser le trajet (réutilise le rendu `lines` de `StationMap`).
- Le clic sur un défi définit `focus` sur la gagnante (`setFocus`) → `FocusController` (`src/components/StationMap.tsx:49`) fait déjà `flyTo` + ouvre le popup.

## 2. Scope : existant vs nouveaux calculs

### Existant (réutilisé tel quel)

- Fetch des disponibilités depuis l'origine : `getDestinations(dateFrom, dateTo, codes)` (`src/api/tgvmax.ts:134`) retourne `Leg[]` (trajets directs origine→destination). C'est exactement la donnée des défis « directs ». Il y a déjà un `useEffect` dans `App.tsx:225-266` qui appelle `getDestinations`/`getOrigins` selon `mode` — on étend cette logique au mode `challenges`.
- Géographie : `haversineKm`, `getStation`, `getAllStations`, `canonicalCode` (`src/lib/geo.ts`).
- Durées : `toMinutes` (`src/lib/itinerary.ts:12`) pour convertir `heure_depart`/`heure_arrivee` en minutes, et `formatDuration` (`src/lib/itinerary.ts:20`) pour l'affichage.
- Graphe d'itinéraires : `findItineraries` (`src/lib/itinerary.ts:29`) et `getRangeEdges` (`src/api/tgvmax.ts:187`) pour le défi « avec correspondances ».
- Rendus : `StationMap` (points/lines/focus), `ResultsList`, `StationMultiSelect`, `DateRangePicker`.

### Nouveau : module de calcul `src/lib/challenges.ts`

Nouveau module **pur** (fonctions déterministes, sans React) qui prend `Leg[]` (ou `Edge[]` + `Station`) en entrée et renvoie un résultat. Types proposés (ajoutés à `src/types.ts`) :

```ts
type ChallengeKind =
  | 'far-direct'
  | 'longest-under-3h'
  | 'most-departures'
  | 'earliest-departure'
  | 'most-days'
  | 'longest-itinerary';

interface ChallengeResult {
  kind: ChallengeKind;
  title: string;
  winner: Station | null;        // station gagnante (pinnable)
  winnerCode?: string;           // code canonique de la gagnante
  metric?: number;               // valeur affichée (km, min, nb, ...)
  detail?: string;               // libellé lisible
  legs?: Leg[];                  // trajets justifiant la réponse
  edge?: Edge;                   // pour le défi itinéraire
}
```

### Défis proposés et logique d'agrégation

Pour chaque défi, **source de données** et **logique en mots** (toutes les distances via `haversineKm` entre `origin.lat/lon` et `dest.lat/lon` obtenues par `getStation(leg.destination_iata)`).

| Défi | Source | Logique d'agrégation (en mots) |
|------|--------|--------------------------------|
| **1. `far-direct`** — « destination directe la plus lointaine » | `Leg[]` (via `getDestinations`) | Parcourir les legs ; pour chaque `leg`, résoudre la gare d'arrivée via `getStation(leg.destination_iata)` ; calculer `haversineKm(origin.lat, origin.lon, dest.lat, dest.lon)` ; conserver le **maximum** de distance. Réponse = la destination réalisant ce max + la distance (arrondie en km). |
| **2. `longest-under-3h`** — « trajet direct le plus long en moins de 3 h » | `Leg[]` | Pour chaque `leg`, durée = `toMinutes(leg.heure_arrivee) - toMinutes(leg.heure_depart)` ; **filtrer** `durée < 180` minutes ; parmi les restants, conserver la **durée maximale**. Réponse = l'origine→destination du trajet retenu + `formatDuration(durée)`. |
| **3. `most-departures`** — « destination avec le plus de départs » | `Leg[]` | **Grouper** les legs par `leg.destination_iata` ; **compter** le nombre de legs par destination ; conserver la destination au **compte maximum**. Réponse = destination + compte (et nombre de jours distincts via `Set` sur `leg.date`). |
| **4. `earliest-departure`** — « premier départ de la journée » | `Leg[]` | Conserver le **minimum** de `toMinutes(leg.heure_depart)` parmi les legs (sur la plage). Réponse = le `Leg` correspondant + son `heure_depart`. |
| **5. `most-days`** — « destination disponible le plus de jours » | `Leg[]` | Grouper par `leg.destination_iata` ; pour chaque groupe, compter les **dates distinctes** (`new Set(leg.date)`) ; conserver le **maximum** de jours distincts. Réponse = destination + nombre de jours. |
| **6. `longest-itinerary`** — « l'itinéraire le plus long possible (avec correspondances) » | `Edge[]` (via `getRangeEdges`) + `findItineraries` | Charger `getRangeEdges(dateFrom, dateTo)` puis `canonicalizeEdges` ; appeler `findItineraries(edges, [origin.code], toutesDestinations, {maxLegs: 3})` ; mesurer pour chaque `Itinerary` la durée totale `arrivalTime - departureTime` (ou la distance cumulée) ; conserver le **maximum**. Réponse = itinéraire gagnant + `formatDuration`. |

> Note : les défis 1 à 5 ne nécessitent **aucun** nouvel appel réseau si `mode === 'challenges'` réutilise le `useEffect` existant (`getDestinations`) ; le défi 6 nécessite l'appel CSV `getRangeEdges` + `findItineraries` (déjà utilisés par le mode itinéraire).

## 3. Fichiers affectés

- **`src/types.ts`**
  - Étendre `Mode` : `type Mode = 'origin' | 'destination' | 'itinerary' | 'challenges';` (ligne 80).
  - Ajouter `ChallengeKind`, `ChallengeResult` (et éventuellement un type `ChallengeDef` décrivant titre/description/méthode de calcul).
- **`src/components/ModeTabs.tsx`**
  - Ajouter une entrée `{ mode: 'challenges', label: 'Défis' }` au tableau `TABS` (lignes 13-17).
- **`src/lib/challenges.ts`** *(nouveau)*
  - Fonctions pures d'agrégation, une par défi (voir section 2). Signature typique : `computeFarDirect(legs: Leg[], origin: Station): ChallengeResult`.
  - Une fonction d'orchestration `computeChallenges(legs, origin)` ou `computeChallenges(legs, edges, origin)` qui retourne `ChallengeResult[]`.
- **`src/App.tsx`**
  - Nouvel état éventuel `challengeResults: ChallengeResult[]` (ou calculé par `useMemo` à partir de `legs`/`edges` + `origin`).
  - Étendre le `useEffect` de fetch (lignes 225-266) pour que `mode === 'challenges'` appelle `getDestinations(dateFrom, dateTo, originCodes)` comme le mode `origin`.
  - Étendre `mapPoints` (ligne 518) avec une branche `mode === 'challenges'` : épingler la/les gagnante(s) en couleur dédiée + `MapLine` origine→gagnante.
  - Ajouter le rendu sidebar de la liste de défis (sous le sélecteur d'origine) + `onSelect` qui appelle `setFocus` sur la gagnante.
  - `handleModeChange` : pas de changement nécessaire (déjà générique), vérifier que l'état `challengeResults` est bien réinitialisé.
- **`src/index.css`**
  - Styles éventuels pour les cartes de défis (état résolu ✓, couleur dorée de la gagnante, badge).
- **`README.md`**
  - Documenter le nouveau mode (section « Fonctionnalités » + « Structure »).

## 4. Étapes d'implémentation (ordre)

1. Ajouter `'challenges'` à `Mode` dans `src/types.ts` et l'onglet dans `ModeTabs.tsx`. Vérifier que la compilation passe (`npm run typecheck`).
2. Créer `src/lib/challenges.ts` avec les fonctions pures d'agrégation + types `ChallengeKind`/`ChallengeResult`. Écrire quelques tests unitaires rapides (données `Leg[]` factices) si le projet a un framework de test (à confirmer — sinon validation manuelle).
3. Dans `App.tsx`, brancher le fetch : mode `challenges` → `getDestinations` (comme `origin`), en réutilisant `canonicalizeLeg`.
4. Calculer `challengeResults` via `useMemo` à partir de `legs` (+ `edges` pour le défi 6), en passant l'`origin` sélectionné.
5. Rendre la liste de défis dans la sidebar (cartes réutilisant le style `result-card`), avec état résolu/en cours/aucune donnée.
6. Étendre `mapPoints` (et `mapLines`) pour le mode `challenges` : gagnante en doré + ligne origine→gagnante + `focus` au clic.
7. Ajouter le défi 6 (itinéraire avec correspondances) si la charge `getRangeEdges` est acceptable (voir risques).
8. Ajuster `src/index.css` et mettre à jour `README.md`. Lancer `npm run typecheck` puis `npm run build`.

## 5. Cas limites

- **Aucun résultat** : si `legs` est vide (gare sans disponibilité MAX sur la plage), chaque défi retourne `winner: null` → carte affiche « Aucune disponibilité MAX sur la période pour cette gare. » (message déjà utilisé par `LegList`).
- **Égalité (ties)** : plusieurs destinations réalisent le même max (ex. deux destinations à distance quasi identique). Politique : conserver la **première** rencontrée dans l'ordre de tri des `legs` (déjà triés par date puis `heure_depart` dans `fetchAllLegs`, `src/api/tgvmax.ts:116-119`), ou toutes les afficher en cas d'ex æquo strict. À trancher (voir questions ouvertes).
- **Trains déjà partis aujourd'hui** : la logique `visibleLegs` (`src/App.tsx:423-435`) filtre `isToday(leg.date) && dep < nowMinutes()`. Il faut appliquer le **même filtre** aux legs avant agrégation des défis, sinon un « premier départ » pourrait être un train déjà parti. Réutiliser `isToday` et `nowMinutes` (`src/App.tsx:50-61`).
- **Origines multiples** : `StationMultiSelect` autorise plusieurs gares (les `codes` de chaque `Station`). Décision : les défis s'évaluent **par rapport à une seule gare** (la première sélectionnée) pour rester lisibles, ou en combinant toutes les origines (le défi devient « depuis l'une de mes gares »). Préciser dans l'UI. On peut limiter à une seule gare en mode défis (simplification recommandée).
- **Origine non géocodée** : `getStation(leg.destination_iata)` peut renvoyer `undefined` (gare hors `stations.json`). Ignorer ces legs silencieusement (pas de `haversineKm` possible).
- **Codes multiples / groupes de gares** : `destination_iata` doit passer par `canonicalCode` avant groupement, sinon « PARIS (intramuros) » éclaté en plusieurs codes fausse les comptages. Utiliser `canonicalizeLeg` (déjà appliqué à `legs` dans `App.tsx:252`).
- **Défi 6 coûteux** : `getRangeEdges` télécharge le CSV complet de la plage (potentiellement volumineux). Le défi 6 doit être calculé **à la demande** (bouton par défi) ou retardé, et respecter `edgesCache` (`src/App.tsx:205`) pour éviter de re-télécharger.
- **Plafond `MAX_OFFSET=10000`** (`src/api/tgvmax.ts:27`) : `getDestinations` plafonne à 10 000 lignes ; pour une seule origine sur 30 jours c'est largement suffisant, mais à documenter.

## 6. Effort et risques

- **Effort : M** (moyen). La majorité du code existe déjà (fetch `getDestinations`, `haversineKm`, `formatDuration`, rendu carte/focus). Le travail principal est : un nouveau module pur d'agrégation (~5-6 petites fonctions), un onglet, une branche `mapPoints`, et le rendu sidebar. Le défi 6 (itinéraire) est le seul point plus lourd ; sans lui l'effort tombe à **S**.
- **Risques** :
  - **Volume de données** : défis sur plage large (14 jours max via `DateRangePicker`, ou 30 jours) → plusieurs centaines de legs à agréger côté client. Négligeable en CPU mais attention à `getRangeEdges` (défi 6).
  - **Comportement de tri / ties non déterministe** : ex æquo fréquents (destinations à distance proche) → nécessite une règle explicite.
  - **Sémantique des défis** : « le plus long » peut être interprété en distance ou en durée (voir questions ouvertes) ; mal défini, le défi peut être peu satisfaisant.
  - **Couleur de gagnante** : s'assurer qu'une nouvelle couleur (doré) reste lisible en thème sombre (`dark` mode) et ne prête pas à confusion avec `INTERMEDIATE`.
  - **Extension du `Mode`** : impacter tout `switch`/condition sur `mode` existant (le code utilise surtout des `===`), mais vérifier qu'aucun rendu existant ne casse (ex. `DateRangePicker`/`TimeFilter` rendus inconditionnellement).

## 7. Questions ouvertes

1. **Origine unique ou multi ?** Les défis doivent-ils s'évaluer pour une seule gare de départ (recommandé) ou pour la liste multi-origines ? Limiter à une seule simplifie fortement l'UI et l'agrégation.
2. **Sémantique de « le plus long »** : pour le défi 2, parle-t-on de **durée maximale** (sous 3 h) ou de **distance maximale** sous 3 h ? Les deux sont intéressants mais pas équivalents. Idem pour le défi 6 (durée totale vs distance cumulée vs nombre de correspondances).
3. **Fenêtre des défis** : évaluer sur la plage `[dateFrom, dateTo]` sélectionnée, ou toujours sur la fenêtre 30 jours complète (`range.min..range.max`) ? La plage utilisateur est plus cohérente avec le reste de l'app, mais « le plus de départs » gagne en sens sur 30 jours.
4. **Filtre horaire** : faut-il appliquer `TimeFilter` aux défis comme `visibleLegs`, ou les défis ignorent-ils les filtres horaires (calcul sur toutes les disponibilités du jour) ?
5. **Défi 6 (itinéraire)** : vaut-il la charge `getRangeEdges` ? L'ajouter en v2, ou le calculer à la demande uniquement ?
6. **Persistance / « trophées »** : faut-il mémoriser les défis résolus (localStorage, comme `tgvmax-theme` à `src/App.tsx:186`) ou est-ce purement stateless par session ?
7. **Tests** : le projet n'a pas de framework de test visible (`package.json` ne liste que `typecheck`/`build`). Faut-il introduire un runner minimal (ex. Vitest) pour `src/lib/challenges.ts`, ou valider manuellement ?
8. **Ex æquo** : afficher une seule gagnante (première) ou toutes les gagnantes ex æquo dans la réponse/le pin ?
