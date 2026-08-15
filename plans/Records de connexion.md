# Plan d'implémentation — « Records de connexion » (itinéraire le plus absurde)

## 1. Objectif / description UX

Ajouter, dans le mode **Itinéraire**, une variante de recherche qui, au lieu de minimiser l'heure d'arrivée ou le nombre de correspondances, **maximise le nombre de correspondances** : trouver le trajet le plus « absurde » reliant un départ à une arrivée le même jour (ex. Paris → Lille en passant par Marseille, Lyon, Strasbourg…), dans les limites d'un nombre maximal de correspondances configurable et des fenêtres de correspondance min/max.

### Déclenchement
- Un sélecteur « Type de recherche » est déjà présent dans le mode itinéraire (`src/App.tsx:712-725`), à côté du choix Aller simple / Aller-retour. On y ajoute un second sélecteur (ou une paire de boutons) : **« Trajet normal »** vs **« Le plus absurde (record de connexions) »**.
- Le mode record réutilise les mêmes champs **Départs / Arrivées**, la même **plage de dates**, et les mêmes **sliders de contraintes** (`ItineraryControls`), auxquels on ajoute un budget de **durée maximale** (optionnel, cf. §7).

### Classement / étiquetage des résultats
- Les itinéraires sont **triés par nombre de correspondances décroissant** (`legs.length - 1`), puis, à égalité, par **durée totale croissante** (le plus « efficace » parmi les absurdes), puis par heure d'arrivée.
- Chaque carte de résultat affiche le badge « N correspondances » existant (`src/components/ResultsList.tsx:104-108`) ; on pourra surligner le **record** (max absolu trouvé) avec un badge dédié (ex. « record ») et une couleur distincte sur la carte.
- Les onglets de filtrage par nombre de correspondances (`App.tsx:915-933`) restent utilisables, mais l'ordre par défaut devient « correspondances décroissant ».

## 2. Scope : existant vs nécessaire — analyse clé du BFS actuel

### Ce qui existe déjà
- `findItineraries(edges, from, to, options)` dans `src/lib/itinerary.ts:29` : BFS en largeur (niveau par niveau via `queue`/`next`, lignes 57-88), avec :
  - `maxLegs` (= `maxConnections + 1`) pour borner la profondeur (ligne 69) ;
  - fenêtres de correspondance `minConnection`/`maxConnection` (lignes 79-80) ;
  - **`visited` set** par état : interdit de repasser par une gare déjà visitée dans le même itinéraire (lignes 50, 78, 83) ;
  - **`best` map** : conserve, par `(gare, nbLegs)`, l'heure d'arrivée **la plus précoce** et élague tout état arrivant plus tard à la même gare avec le même nombre de tronçons (lignes 54, 71-75) ;
  - tri final par `arrivalTime` puis `legs.length`, tronqué à `MAX_RESULTS = 200` (lignes 9, 90-91).

### Pourquoi le BFS actuel n'est PAS adapté au record de connexions

1. **Tri final et plafond `MAX_RESULTS=200`** : le BFS trie par heure d'arrivée croissante puis tronque à 200. Un trajet à 7 correspondances qui arrive tard sera noyé/écarté derrière des centaines de trajets directs ou à 1-2 correspondances. Le « plus absurde » est structurellement écarté du résultat. (`itinerary.ts:90-91`)

2. **Élagage `best` = dominance par l'heure d'arrivée, PAS par le nombre de tronçons.** L'objectif « maximiser le nombre de legs » n'est pas monotone par rapport à l'heure d'arrivée **lorsque les `visited` sets diffèrent**. Exemple concret : deux états atteignent Lyon avec le même nombre de legs — l'état A (arrivée 10:00) a déjà visité Paris, X ; l'état B (arrivée 11:00) a visité Paris, Y. Le `best` map garde A et supprime B. Mais B n'a pas visité X, donc B pourrait continuer via X vers plus de tronçons alors que A ne peut pas. Arriver plus tôt **ne domine pas** quand on peut atteindre le même point avec des gares intermédiaires différentes : l'élagage `best` peut couper un chemin de longueur maximale. (`itinerary.ts:71-75`)

3. **`visited` set** : c'est en réalité la bonne contrainte pour le record — elle empêche les cycles triviaux (Paris→Lyon→Paris→Lyon…) qui gonfleraient artificiellement le compte de correspondances sans ajouter d'absurdité réelle. Le record de connexion doit maximiser le nombre de **gares distinctes** traversées. On conserve donc un graphe **sans cycle par itinéraire** (plus court chemin simple borné par `maxLegs`), mais il faut l'appliquer dans une recherche dédiée, pas dans le BFS orienté « arrivée la plus précoce ».

### Conclusion : variante de recherche nécessaire
Oui, une nouvelle variante est requise : une **recherche type plus-long-chemin / DFS** sur graphe de tronçons ordonnés temporellement, avec :
- contrainte **sans cycle** par itinéraire (`visited` set, comme aujourd'hui) ;
- profondeur bornée par `maxLegs` ;
- respect des fenêtres `minConnection`/`maxConnection` ;
- objectif **maximiser `legs.length`** (puis minimiser la durée) ;
- élaboration d'un **budget de durée max** optionnel (arrivée avant une borne, ou durée totale plafonnée).

On **n'utilise pas** le `best` map (ou alors une forme affaiblie et non privilégiée, cf. §5) car sa dominance par heure d'arrivée est invalide ici.

## 3. Fichiers concernés

- **`src/lib/itinerary.ts`** — ajout d'une fonction dédiée `findLongestItineraries(edges, from, to, options)` (nom à confirmer) :
  - réutilise `toMinutes`, `formatDuration`, le type `ItineraryOptions` étendu (ajout `maxDuration?`) ;
  - construit le même index `outgoing` (`Map<string, Edge[]>`) que `findItineraries` (lignes 39-44) ;
  - explore par **DFS récursif ou pile explicite**, ordonne les tronçons sortants par `dep` croissant pour couper tôt ;
  - retourne les `MAX_RESULTS` meilleurs itinéraires triés par `legs.length` décroissant, durée croissante, `arrivalTime` croissant.
- **`src/App.tsx`** — ajout d'un état `searchKind: 'normal' | 'record'` :
  - branchement dans les `useMemo` `itineraries` (`App.tsx:295-326`) et `returnItineraries` (`App.tsx:328-367`) vers la nouvelle fonction quand `searchKind === 'record'` ;
  - état de tri par défaut adapté (le tri existant par « correspondances » doit permettre le **décroissant** en mode record — actuellement seul `connections:asc` est proposé, `App.tsx:968`) ;
  - nouveau contrôle « budget durée max » (optionnel) passé dans `options` ;
  - reset du `searchKind` à la normale lors d'un changement de mode (`handleModeChange`, `App.tsx:464`).
- **`src/components/ItineraryControls.tsx`** — relever la borne haute du slider « Correspondances max » (actuellement `max={2}`, lignes 50-51) à une valeur plus élevée (ex. 8-10) **uniquement en mode record**, et éventuellement ajouter un slider « Durée max ».
- **`src/components/ResultsList.tsx`** — badge « record » optionnel + affichage du nombre total de correspondances du meilleur résultat.
- **`src/components/ModeTabs.tsx`** — aucune modification si on reste un sous-mode d'« Itinéraire » (recommandé) ; à revoir si on opte pour un 4ᵉ onglet.
- **`src/types.ts`** — aucun nouveau type strictement requis : `Itinerary`/`Edge` existants suffisent (`types.ts:44-61`). Éventuellement étendre `ItineraryOptions` (déjà dans `itinerary.ts`) avec `maxDuration`.

## 4. Étapes d'implémentation (ordonnées)

1. Étendre `ItineraryOptions` dans `src/lib/itinerary.ts` avec `maxDuration?` (minutes) et un flag/branche si nécessaire.
2. Implémenter `findLongestItineraries` dans `src/lib/itinerary.ts` : DFS itératif, `visited` par état, fenêtres de correspondance, borne `maxLegs`, budget durée, collecte des meilleurs par `legs.length` décroissant. Ajouter une **borne d'optimisation** (garder le meilleur `legs.length` courant et couper les branches ne pouvant plus le dépasser).
3. Tests unitaires ciblés (voir scripts de test existants / `npm run typecheck`) sur des graphes jouets : chemin long vs chemin direct, cycles interdits, fenêtres respectées.
4. Dans `App.tsx`, introduire `searchKind`, brancher les deux `useMemo`, adapter le tri par défaut et le contrôle « correspondances max ».
5. Relever la borne du slider dans `ItineraryControls.tsx` pour le mode record + slider « Durée max ».
6. Ajuster l'affichage (`ResultsList.tsx`) : badge record, libellés, tri correspondances décroissant.
7. Vérifier l'intégration carte (`mapLines`/`mapPoints` dans `App.tsx:602-697`) : les trajets longs à nombreux points intermédiaires s'affichent déjà via `INTERMEDIATE` (`App.tsx:37`) ; valider la lisibilité (couleur/épaisseur dédiées si besoin).
8. `npm run typecheck` et `npm run build` pour valider.

## 5. Edge cases

- **Arrivée le même jour** : déjà garanti structurellement — `computeDayItineraries` (`App.tsx:82-112`) partitionne les tronçons par `date` et appelle la recherche sur un seul jour ; tous les `Edge` d'un appel partagent la même date. Aucun risque de trajet à cheval sur deux jours. Le budget durée est donc une contrainte **d'utilité** (éviter un trajet de 16 h pour 3 h de route), pas de correction d'un débordement minuit.
- **Fenêtres de correspondance** : `minConnection`/`maxConnection` restent appliqués identiquement (`edge.dep` entre `last.arr + min` et `last.arr + max`). Un `minConnection` élevé réduit le nombre de tronçons possibles le même jour — comportement attendu.
- **Explosion combinatoire à `maxConnections` élevé** : c'est le risque majeur. Le graphe journalier compte ~343 gares (`stations.json`) et des milliers de tronçons `OUI` ; un DFS sans garde-fou diverge. Garde-fous à prévoir : (a) **bound** : mémoriser le meilleur nombre de legs trouvé et couper toute branche qui ne peut plus l'atteindre (`legs.length + (maxLegs - legs.length) < best`) ; (b) **ordonnancement temporel** des voisins par `dep` croissant pour trouver vite de bonnes solutions ; (c) **plafond global d'états visités** (itération ou temps) avec arrêt propre ; (d) limiter la borne du slider (ex. 8-10 correspondances max) pour borner la profondeur.
- **Réutiliser ou non le `best` map** : une dominance stricte par `(gare, nbLegs, heure d'arrivée)` est **incorrecte** (cf. §2 point 2). On peut, à la marge, garder une dominance « même gare, même nbLegs, heure d'arrivée ≤ **et** `visited` ⊇ » (domination par sous-ensemble), mais elle est coûteuse à tester ; ne pas l'implémenter dans un premier temps, préférer le bound simple.
- **Aucun itinéraire absurde trouvé** : à `maxConnections` élevé mais réseau peu connecté, le record retombe sur le trajet normal (1-2 correspondances). L'UI doit afficher un hint « Pas de trajet plus long trouvé avec ces contraintes » plutôt qu'un silence.
- **Tronçons multiples dans la journée** : plusieurs départs/jour pour un même couple (gare, gare) ; la recherche doit considérer **tous** les créneaux, pas seulement le premier, sinon on rate des chaînes plus longues.
- **Performance vs plafond `MAX_ITINERARIES=500` / `MAX_RESULTS=200`** : le record ne nécessite que le **top N** (par legs), mais le tri intermédiaire par durée croissante peut être coûteux ; utiliser un petit tas/tri partiel si nécessaire.

## 6. Estimation d'effort et risques

- **Effort : M (moyen).** L'essentiel est une nouvelle fonction de recherche (100-150 lignes) + un branchement UI + tests. Pas de changement d'API, pas de backend, pas de nouveau type de donnée.
- **Risques :**
  - *Explosion combinatoire* (élevé) : le plus gros risque ; mitigé par la profondeur bornée, le bound et le plafond d'états.
  - *Régression du BFS normal* (faible) : on ne touche pas `findItineraries` existant ; la nouvelle fonction coexiste.
  - *Lisibilité UX* (moyen) : afficher un trajet à 8 correspondances sur la carte/la liste devient dense ; prévoir une présentation repliée.
  - *Bornes du slider* (faible) : relever `maxConnections` ne doit pas dégrader le mode normal (borne dynamique selon `searchKind`).

## 7. Questions ouvertes

1. **Sous-mode vs 4ᵉ onglet** : le record doit-il être un sous-mode du mode « Itinéraire » (recommandé, réutilise champs + contraintes) ou un nouvel onglet `Mode` dédié (`ModeTabs.tsx:13-17`, `Mode = 'origin' | 'destination' | 'itinerary'` dans `types.ts:80`) ?
2. **Budget de durée** : faut-il un slider « Durée max » explicite, ou seulement une borne implicite « arriver avant minuit » ? Quelle valeur par défaut (ex. 14 h) ?
3. **Borne haute de `maxConnections`** : quelle valeur maximale raisonnable autoriser (6 ? 8 ? 10 ?) compte tenu de la profondeur et du risque d'explosion ?
4. **Critère de départage** : à nombre de correspondances égal, préférer durée minimale, heure d'arrivée minimale, ou distance kilométrique maximale (via `haversineKm`, `src/lib/geo.ts:11`) ? La « distance parcourue » est peut-être une meilleure mesure de l'« absurdité » que la durée.
5. **Faut-il compter les correspondances ou les gares distinctes ?** La contrainte sans-cycle garantit des gares distinctes, donc `legs.length - 1` reste le bon compteur — à confirmer.
6. **Aller-retour en mode record** : appliquer la variante absurde aux deux sens (`returnItineraries`) ou seulement à l'aller ?
7. **Nom de la fonction / du libellé UX** : « Le plus absurde », « Record de connexions », « Max de correspondances » — à trancher pour l'UI.
