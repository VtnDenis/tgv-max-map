# Plan — Confettis / easter eggs

## 1. Objectif / description UX

Petite célébration visuelle légère et discrète quand l'utilisateur trouve un **train direct partant aujourd'hui** (direct le jour même, c.-à-d. non encore parti).

**Quand l'effet se déclenche**
- En mode `itinerary` : dès qu'au moins un `Itinerary` visible est **direct** (`itinerary.legs.length === 1`) **et** part **aujourd'hui** (`it.date` satisfait `isToday(...)` **et** `departureTime >= nowMinutes()`).
- En mode `origin` / `destination` : chaque `Leg` est intrinsèquement un train direct ; l'effet se déclenche dès qu'au moins un `Leg` visible est daté d'aujourd'hui avec un départ encore à venir (`isToday(leg.date)` **et** `toMinutes(leg.heure_depart) >= nowMinutes()`).

**Ce que ça affiche**
- Une rafale de confettis (petits rectangles/cercles colorés) projetée depuis le haut de la fenêtre, par-dessus la carte et le panneau, pendant ~1,5 s.
- Overlay `position: fixed; inset: 0; pointer-events: none` (ne bloque aucune interaction), auto-détruit à la fin de l'animation.
- Palette inspirée des couleurs du produit : `#e3000f` (FIXED), `#0f9d58` (AVAILABLE), `#b26a00` (INTERMEDIATE), plus blanc/or pour être lisible en sombre et en clair.

**Durée / intensité**
- ~1 200–1 500 ms, ~120–180 particules, `requestAnimationFrame` stoppé dès que toutes les particules sont hors écran.

**Compatibilité dark-mode**
- Le canvas dessine ses propres couleurs (pas de CSS `var(...)` requis) : choisir une palette qui contraste bien sur les deux thèmes. Le mode sombre est porté par `data-theme` sur `<html>` (voir `src/App.tsx:195-198`), ce qui n'affecte pas un canvas plein écran.
- Respect de `prefers-reduced-motion: reduce` (voir §5) : pas de confettis, éventuellement un simple `hint` textuel.

**Easter eggs optionnels (discrets)**
1. **Raccourci clavier caché** : code Konami (`↑ ↑ ↓ ↓ ← → ← → B A`) qui déclenche une rafale de confettis + un mini-toast « MAX ! ».
2. **Destination lointaine** : confettis renforcés quand un direct du jour rejoint une gare **à plus de ~800 km** (calcul via `haversineKm` de `src/lib/geo.ts:11`). Thème « grand voyage ».

---

## 2. Scope : existant vs nouveau + stratégie de dépendance

**Existant (réutilisé, non modifié)**
- `src/App.tsx:50` `isToday(date)` — détection « aujourd'hui ».
- `src/App.tsx:58` `nowMinutes()` — départ encore à venir.
- `src/App.tsx:423` `visibleLegs` — `Leg[]` déjà filtrés (trains d'aujourd'hui déjà partis retirés ligne 430).
- `src/App.tsx:295` `itineraries` / `src/App.tsx:328` `returnItineraries` et `src/App.tsx:369` `activeItineraries` / `src/App.tsx:394` `visibleItineraries` — `Itinerary[]` visibles.
- `src/lib/geo.ts:11` `haversineKm` — distance pour l'easter egg « destination lointaine ».
- `src/types.ts` — `Leg`, `Itinerary`, `Edge`.
- `src/components/ResultsList.tsx` — `LegList` / `ItineraryList` (rendu, pas de logique à ajouter obligatoirement).

**Nouveau**
- Moteur de confettis (canvas, framework-agnostic).
- Hook React de détection + déclenchement unique.
- Hook pour le code Konami.
- Quelques lignes CSS d'overlay (aucun `@keyframes` n'existe aujourd'hui dans `src/index.css` — seulement des `transition`, voir lignes 364, 570).

**Stratégie de dépendance — décision : zéro dépendance, canvas maison**

`package.json` ne contient que `leaflet`, `react`, `react-dom`, `react-leaflet`, `react-range` (aucune lib d'animation). Ajouter `canvas-confetti` (~5 Ko gzippé) serait raisonnable mais inutile pour une seule rafale. On préfère :

- **Canvas 2D plein écran** (~80–120 lignes dans `src/lib/confetti.ts`) : contrôle total de la palette, du nombre de particules, de la durée, de `prefers-reduced-motion`, et de l'origine de l'émission (dont l'écran mobile étroit). Pas de dépendance transitive, pas de montée de bundle, cohérent avec la volonté d'une app 100 % sans backend et légère.
- **Pas de `@keyframes` CSS** pour la rafale principale : le CSS convient à 10-30 éléments animés en `transform`, mais pas à 150 particules avec trajectoires pseudo-physiques sans générer 150 nœuds DOM. Le canvas est plus performant et se nettoie seul.

> Alternative acceptée si on veut moins de code : ajouter `canvas-confetti` (dépendance minuscule, éprouvée). Le plan reste compatible : seule l'implémentation de `src/lib/confetti.ts` changerait (délégation à la lib). Le reste (détection, dédup, reduced-motion) est inchangé.

---

## 3. Fichiers impactés (chemins exacts + changements)

| Fichier | Type | Changement |
|---|---|---|
| `src/lib/confetti.ts` | **nouveau** | Moteur canvas : fonction `burstConfetti(opts)` qui crée un `<canvas>` fixed plein écran, génère N particules, anime via `requestAnimationFrame`, retire le canvas en fin. Options : `origin` (ex. `{x, y}` normalisés), `count`, `colors`, `duration`, `spread`. Export d'un `colorSet` aligné sur `#e3000f` / `#0f9d58` / `#b26a00` / blanc / or. |
| `src/hooks/useConfetti.ts` | **nouveau** | Hook `useConfetti()` : expose `fire(intensity?)` ; garde `prefers-reduced-motion` (si `reduce`, ne fait rien ou renvoie `false` pour afficher un fallback textuel) ; singleton de canvas pour éviter les empilements. |
| `src/hooks/useSameDayCelebration.ts` | **nouveau** | Hook `useSameDayCelebration({ mode, legs, itineraries, returnItineraries, directionTab })` : détecte les directs du jour (cf. §1), construit une **signature** déterministe, ne déclenche qu'une fois par signature (voir §5), applique l'intensité « destination lointaine » via `haversineKm`. |
| `src/hooks/useKonamiCode.ts` | **nouveau** | Hook `useKonamiCode(callback)` : écoute `keydown` global, détecte la séquence `↑↑↓↓←→←→BA`, appelle `callback` une fois (reset automatique). |
| `src/App.tsx` | modif | Import + appel des hooks au niveau du composant `App` (près de `useGeolocation`/`useMemo`) ; branchement du raccourci Konami sur `fire()`. Aucune logique métier modifiée : on **lit** les `useMemo` existants, on ne les réécrit pas. |
| `src/index.css` | modif | Ajout : `.confetti-canvas` (position fixed, inset 0, pointer-events none, z-index élevé ~ `2000`, pour passer au-dessus de Leaflet `~1000` et du panneau mobile `~1200-1300`) ; bloc `@media (prefers-reduced-motion: reduce)` désactivant d'éventuelles animations CSS résiduelles. Aucun `@keyframes` requis si la rafale est 100 % canvas. |

---

## 4. Étapes d'implémentation (ordonnées)

1. **`src/lib/confetti.ts`** — implémenter `burstConfetti` : création du canvas, `getContext('2d')`, boucle `requestAnimationFrame`, gravité légère, rotation, opacité décroissante, destruction du canvas + `cancelAnimationFrame` à la fin (et en cas de `unmount`). Lui passer un `signal`/`cleanup` retourné pour annuler.
2. **`src/hooks/useConfetti.ts`** — wrapper React : lecture de `window.matchMedia('(prefers-reduced-motion: reduce)')`, `useCallback` stable `fire`, nettoyage `useEffect` (annule toute rafale en cours au `unmount`).
3. **`src/hooks/useSameDayCelebration.ts`** — logique de détection :
   - signature `sameDayDirect` = liste triée de tuples `(date, from, to, depMinutes)` pour les directs du jour encore à venir, quel que soit le mode ;
   - `useEffect` sur cette signature : si non vide et différente de la dernière tirée (stockée dans `useRef`), appeler `fire(intensity)`.
   - `intensity` boostée si au moins une extrémité est à `haversineKm(...) > 800`.
4. **`src/hooks/useKonamiCode.ts`** — séquence et `callback` ; ignorer les touches quand le focus est dans un `input`/`select` (éviter les faux positifs).
5. **`src/App.tsx`** — brancher : appeler `useSameDayCelebration` avec `mode`, `visibleLegs`, `visibleItineraries` (ou `activeItineraries` selon la décision §7), `directionTab` ; `useKonamiCode(() => fire('max'))`.
6. **`src/index.css`** — ajouter `.confetti-canvas` + le bloc `prefers-reduced-motion`.
7. **Vérifs** — `npm run typecheck` puis `npm run build` ; test manuel en mode `itinerary` (recherche Paris → Lyon un jour ouvré avec directs aujourd'hui) et en mode `origin`.

---

## 5. Cas limites

- **Spam au re-render** : `visibleLegs`/`visibleItineraries` sont recalculés à chaque changement de filtre/tri. On ne peut pas déclencher dans un simple `useEffect` sur le tableau (risque de double-tir en dev à cause de `StrictMode`). Solution : **signature déterministe** (`date + from + to + dep` triés et joints) stockée dans un `useRef` ; on ne tire que si la signature change vers un nouvel ensemble non vide. Le tri / le filtre horaire qui conserve les mêmes directs ne re-déclenche pas.
- **`prefers-reduced-motion: reduce`** : désactiver la rafale (canvas). Optionnel : rendre `fire()` = `false` pour afficher un simple `hint` statique « 🎉 train direct aujourd'hui ». Ne jamais forcer l'animation.
- **`StrictMode` (dev)** : les effets s'exécutent deux fois ; le dédup par `ref` doit être idempotent (comparer la signature avant de tirer). En prod, aucun impact.
- **Performances** : ~150 particules max, un seul canvas à la fois (singleton), `pointer-events: none`, `requestAnimationFrame` annulé à la fin, canvas supprimé du DOM. Aucun `setState` dans la boucle d'animation (pas de re-render React pendant la rafale).
- **Pas de SSR** : Vite/SPA client pur (`src/main.tsx`), `window`/`document` accessibles sans garde particulière (mais garder `matchMedia` derrière un test d'existence par hygiène).
- **Mobile** : overlay `inset: 0` couvre l'écran ; `z-index` au-dessus du panneau repliable (`~1300`) ; ne bloque pas le tap car `pointer-events: none`.
- **Aucun résultat aujourd'hui** : signature vide → pas de tir. Ne pas tirer sur un rechargement où le direct du jour a déjà été célébré (dédup).
- **Changement de mode (`handleModeChange`)** : remet `legs`/`edges` à `null` (lignes 466-467) ; la signature devient vide, le `ref` doit se **réarmer** à ce moment-là pour permettre un nouveau tir dans un autre mode (sinon un changement de mode sans nouvelle signature laisserait le `ref` « déjà vu »).
- **Easter egg lointain** : le seuil (800 km) doit rester approximatif ; ne pas tirer deux fois pour la même cause (le boost d'intensité fait partie de la même signature).

---

## 6. Estimation d'effort & risques

**Effort : S/M (petit-moyen)** — ~½ à 1 jour de travail :
- Moteur canvas : le plus gros morceau (~1-2 h).
- Hooks de détection + dédup : ~1 h.
- Branchement + CSS : ~30 min.
- Tests manuels + réductions de cas limites : ~30 min.

**Risques**
- **Déclenchements intempestifs** (tir à chaque re-render) — mitigé par la signature déterministe ; à tester soigneusement en dev (`StrictMode`).
- **Fuites de canvas / rAF** — le `cleanup` doit être fiable sous `unmount` et en superposition de rafales.
- **UX intrusive** — une rafale à chaque recherche peut lasser ; la dédupliquer et la garder courte (~1,5 s) est essentiel.
- **Compat dark-mode** — un mauvais choix de couleurs peut être illisible sur fond sombre ; la palette est codée en dur et testée sur les deux thèmes.
- **Écart bundle** — négligeable (aucune dépendance ajoutée).

---

## 7. Questions ouvertes

1. Faut-il déclencher sur `visibleItineraries` (filtrés par onglet/tri/jour) ou sur `activeItineraries` (avant filtrage) ? Recommandation : `activeItineraries`, pour célébrer dès qu'un direct du jour **existe**, même si l'utilisateur filtre ensuite.
2. Faut-il un **toast/hint** en complément des confettis (ex. « Direct aujourd'hui — vas-y ! ») ou seulement l'effet visuel ?
3. Le code Konami : à réserver au clavier physique uniquement (les flèches sur mobile ne sont pas fiables) — valider si un déclencheur alternatif tactile est souhaité.
4. Seuil de distance pour l'easter egg « destination lointaine » : 800 km est un ordre de grandeur (Paris → Marseille ≈ 660 km, Paris → Nice ≈ 690 km, Paris → Perpignan ≈ 850 km) ; ajuster le seuil pour que seuls de vrais « grands trajets » déclenchent.
5. Palette exacte des confettis : inclure les 3 couleurs produit + blanc, ou rester sobre (2 couleurs) pour ne pas surcharger ?
6. Souhaite-t-on mémoriser en `localStorage` (ex. `tgvmax-celebrated`) pour ne célébrer un même direct du jour qu'une seule fois par session de navigation ? (actuellement prévu par `useRef`, donc reset au rechargement).
