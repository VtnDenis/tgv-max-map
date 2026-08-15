# Plan — Cartes postales générées

Génération d'une image « carte postale » partageable à partir d'un itinéraire
sélectionné (ou d'un résultat origine→destination), dessinée sur un `<canvas>`
et exportable en PNG / partageable via Web Share API. Aucune exportation
Leaflet n'est nécessaire.

---

## 1. Objectif / description UX

### Où vit le bouton
- **Contexte principal** : mode `itinerary`, une fois un itinéraire sélectionné
  (`selectedOutbound` ou `selectedReturn` non null dans `App.tsx`).
- Un bouton **« Générer une carte postale »** apparaît dans la sidebar, à
  proximité de `ItineraryList`, uniquement quand un itinéraire est sélectionné
  (`selectedOutbound` / `selectedReturn`). Il est désactivé sinon.
- **Contexte secondaire (optionnel)** : modes `origin` / `destination` sur un
  résultat unique (une `Leg`). Voir §7 Open questions — v1 vise le mode
  `itinerary`.

### Layout de la carte (format portrait 4:5, ~1080×1350 px logiques)
Carte stylisée « type ticket / carte postale », dessinée entièrement sur canvas :
1. **En-tête** : titre « TGV MAX » + sous-titre « Carte postale », pastille de
   couleur `FIXED` (`#e3000f`) pour rappeler la marque.
2. **Bandeau trajet** : `ORIGINE → DESTINATION` (noms de gares, ex.
   `PARIS (intramuros) → MARSEILLE`), date du trajet (`itinerary.date` via
   `formatDate`).
3. **Schéma de route** : ligne verticale reliant les gares successives ; chaque
   gare = un point (dot) + son nom (`Edge.fromName` / `Edge.toName` résolus via
   `getStation` pour cohérence). Gares intermédiaires en couleur
   `INTERMEDIATE` (`#b26a00`), départ/arrivée en `FIXED`.
4. **Blocs de correspondance** : pour chaque `Edge`, heure `dep` → `arr`
   (via `formatTime`), numéro de train `trainNo`, durée du segment
   (`formatDuration(arr - dep)`).
5. **Pied de carte** : durée totale (`arrivalTime - departureTime`), nombre de
   correspondances, mention « Généré avec TGV MAX Map ».

### Flux téléchargement / partage
1. Clic sur « Générer une carte postale » → rendu du canvas dans une **modale
   de prévisualisation** (le canvas généré est affiché en `<img>` ou en
   `<canvas>`).
2. Dans la modale, deux actions :
   - **Télécharger PNG** : `canvas.toDataURL('image/png')` + lien
     `<a download>` programmatique.
   - **Partager** : `navigator.share({ files: [...] })` avec un
     `File` produit depuis `canvas.toBlob` ; si `navigator.canShare` / `share`
     échouent ou non supportés, **fallback** sur le téléchargement PNG.

### Dark mode
- Le dessin lit le thème courant (`theme` dans `App.tsx`) pour choisir sa
  palette (fond clair `#f4f5f7`/texte `#1c2733` vs fond sombre `#12161c`/texte
  `#e6ebf0`), cohérente avec les variables CSS de `index.css` (`--bg`,
  `--panel`, `--text`, `--accent`, `--ok`, `--warn`). La carte postale générée
  reflète donc le thème actif au moment du clic.

---

## 2. Scope : existant vs nouveau, et choix d'approche

### Données déjà disponibles au point de déclenchement
Dans `App.tsx`, au moment où l'utilisateur a sélectionné un itinéraire :
- `selectedOutbound: Itinerary | null` (l.169) / `selectedReturn` (l.170).
- `Itinerary` (`src/types.ts` l.56) expose :
  - `legs: Edge[]`
  - `departureTime`, `arrivalTime` (minutes depuis minuit)
  - `date?: string` (YYYY-MM-DD)
- `Edge` (`src/types.ts` l.44) expose :
  - `from`, `to` (codes IATA), `fromName`, `toName`
  - `dep`, `arr` (minutes depuis minuit)
  - `trainNo: string`, `date?: string`
- `getStation(code)` (`src/lib/geo.ts` l.70) → `Station { name, lat, lon }`
  permet d'obtenir les coordonnées réelles de chaque gare si l'on veut un
  positionnement géographique (optionnel).
- Helpers existants : `formatTime(min)` (App.tsx l.68), `formatDate(iso)`
  (App.tsx l.63), `formatDuration(min)` / `toMinutes(hhmm)`
  (`src/lib/itinerary.ts`).

**Liste ordonnée des gares du trajet** : `[getStation(legs[0].from),
getStation(legs[0].to), getStation(legs[1].to), …]` (chaque `legs[i].to` est le
`legs[i+1].from` dans un itinéraire chaîné).

### Choix d'approche de rendu
**Retenu : dessin stylisé sur canvas 2D.** Justification :
- Aucune dépendance d'export Leaflet (ni `html2canvas`, ni `dom-to-image`, ni
  `leaflet-image`) à ajouter — `package.json` n'a pas de lib d'imagerie, et
  rasteriser les tuiles OSM/CARTO pose des problèmes de CORS + attribution.
- Contrôle total du layout (ticket, typographie, palette claire/sombre), rendu
  déterministe, export pixel-parfait multi-DPI.
- Les données utiles (`Itinerary.legs`, `Edge`) suffisent : on n'a même pas
  besoin de `lat`/`lon` pour un schéma vertical linéaire. `getStation` reste
  optionnel (uniquement si on veut un mini-encart géographique — hors v1).

**Écarté : export de la carte Leaflet** — trop complexe (CORS des tuiles,
attribution, rasterisation instable, pas de contrôle du « postcard » design).

### Ce qui existe vs ce qui est nouveau
- **Existant** : `Itinerary`/`Edge`/`Station` (`types.ts`), `getStation`
  (`geo.ts`), `formatTime`/`formatDate`/`formatDuration`, état
  `selectedOutbound`/`selectedReturn` + `theme` dans `App.tsx`.
- **Nouveau** :
  - `src/lib/postcard.ts` — types d'options + fonction pure
    `drawPostcard(ctx, options)` + helper d'export `postcardToBlob`/URL.
  - `src/components/PostcardModal.tsx` — modale de prévisualisation +
    actions Télécharger / Partager.
  - Bouton + état d'ouverture de modale + branchement dans `App.tsx`.
  - Styles additionnels dans `index.css` (modale).

---

## 3. Fichiers affectés

- **`src/lib/postcard.ts` (nouveau)** — logique pure de dessin, sans React :
  - `export interface PostcardOptions { itinerary: Itinerary; theme: 'light' | 'dark'; }`
  - `drawPostcard(ctx: CanvasRenderingContext2D, options): void`
  - `renderPostcardDataUrl(options): string` (crée un canvas offscreen, gère
    `devicePixelRatio`, appelle `drawPostcard`, retourne `toDataURL`).
  - `postcardBlob(options): Promise<Blob>` (via `canvas.toBlob`, pour le share).
  - Contient la palette (miroir des variables CSS) et la mise en page.

- **`src/components/PostcardModal.tsx` (nouveau)** — composant modale :
  - props `{ itinerary: Itinerary | null; theme; onClose }`.
  - Affiche le canvas (`<img src={dataUrl}>` ou `<canvas ref>`), boutons
    « Télécharger PNG » et « Partager », fermeture.
  - Implémente le `navigator.share` avec fallback.

- **`src/App.tsx` (modification)** :
  - Ajouter un état `postcardOpen: boolean`.
  - Ajouter le bouton « Générer une carte postale » dans la branche
    `mode === 'itinerary'` (près de `ItineraryList`), `disabled` quand
    `selectedOutbound`/`selectedReturn` sont `null`.
  - Déterminer l'itinéraire courant selon `directionTab` (retour = `selectedReturn`,
    sinon `selectedOutbound`) — même logique que `mapLines` (l.670-676).
  - Rendre `<PostcardModal itinerary={...} theme={theme} onClose={...} />`.

- **`src/index.css` (modification)** — styles de la modale et du bouton
  (réutilise `--panel`, `--surface`, `--text`, `--border`, `--radius`,
  `--shadow`), responsive mobile (`@media (max-width: 720px)`).

- **`src/types.ts`** — probablement **aucune modification** (aucun nouveau type
  partagé nécessaire si `PostcardOptions` vit dans `postcard.ts`).

- **`package.json`** — **aucune dépendance ajoutée** (canvas natif + Web Share API).

---

## 4. Étapes d'implémentation (ordonnées)

1. **`src/lib/postcard.ts` — squelette + palette**
   - Définir `PostcardOptions` et la palette `light`/`dark` alignée sur
     `index.css` (variables `--bg`, `--panel`, `--text`, `--muted`, `--accent`,
     `--ok`, `--warn`).
   - Constantes de géométrie : largeur logique `W = 1080`, hauteur `H = 1350`,
     marges, rayon des points, hauteur de ligne, tailles de police.

2. **`drawPostcard` — fond + en-tête**
   - `ctx.fillRect` du fond (`bg`), coin arrondi via `roundRect` si dispo sinon
     `path` manuel.
   - Pastille `accent` + titre « TGV MAX » + sous-titre « Carte postale ».

3. **`drawPostcard` — bandeau origine/destination + date**
   - Résoudre `fromName`/`toName` du premier/dernier `Edge` (ou via
     `getStation`) ; `ctx.fillText` grand format.
   - Date : `formatDate(itinerary.date ?? legs[0].date ?? '')` (import depuis
     App.tsx ou extraction dans un helper partagé — voir Open questions).

4. **`drawPostcard` — schéma de route**
   - Construire `stations = [from0, to0, to1, …]` ordonnés.
   - Tracer une `polyline` verticale (points reliés) couleur `INTERMEDIATE`.
   - Pour chaque gare : cercle + nom ; départ/arrivée en `FIXED` (gros), gares
     intermédiaires en `INTERMEDIATE`.
   - Gérer la **hauteur dynamique** : plus il y a de jambes (`legs.length`),
     plus l'espacement vertical est réduit (voir §5).

5. **`drawPostcard` — blocs de segments**
   - Pour chaque `Edge` : `formatTime(dep) → formatTime(arr)`,
     `formatDuration(arr - dep)`, `trainNo`, et correspondance si >1 jambe.
   - Aligner les heures à gauche du point de gare, numéro de train/durée à droite.

6. **`drawPostcard` — pied de carte**
   - Durée totale `formatDuration(arrivalTime - departureTime)`, nombre de
     correspondances `legs.length - 1`, mention de génération.

7. **`drawPostcard` — texte et polices**
   - Toujours définir `ctx.font` (ex. `"600 42px 'Segoe UI', system-ui,
     sans-serif"`) et `ctx.textBaseline`; `ctx.measureText` pour centrer/tronquer.

8. **Export PNG — haute résolution (multi-DPI)**
   - `renderPostcardDataUrl` : `const scale = Math.max(window.devicePixelRatio || 1, 2)`,
     `canvas.width = W * scale`, `canvas.height = H * scale`,
     `ctx.scale(scale, scale)`, puis `drawPostcard`, puis
     `canvas.toDataURL('image/png')`. **Crisp** sur écrans Retina/HiDPI.

9. **`postcardBlob`**
   - `canvas.toBlob(resolve, 'image/png')` wrappé en Promise, retourne
     `Blob | null`.

10. **`src/components/PostcardModal.tsx`**
    - Rendu : `useMemo` du `dataUrl` (dépend de `itinerary`, `theme`), overlay +
      carte, boutons.
    - **Télécharger** : crée un `<a>` avec `href = dataUrl`,
      `download = "tgv-max-<orig>-<dest>-<date>.png"`, `a.click()`.
    - **Partager** : si `navigator.share` et `navigator.canShare({ files })`
      valide → `navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title, text })` ;
      sinon (ou en cas de rejet) → fallback téléchargement.

11. **`src/App.tsx` — branchement**
    - État `postcardOpen`, `currentPostcard = directionTab === 'return' ? selectedReturn : selectedOutbound`.
    - Bouton visible/désactivé selon `currentPostcard`.
    - Rendu de `<PostcardModal ... />`.

12. **`src/index.css` — styles modale/bouton** (overlay, carte, actions,
    responsive).

13. **Validation**
    - `npm run typecheck` (`tsc --noEmit`) et `npm run build`.
    - Test manuel : direct / multi-correspondances / thème clair+sombre /
      mobile / partage + fallback.

---

## 5. Cas limites (edge cases)

- **Aucun itinéraire sélectionné** : bouton `disabled` ; la modale ne s'ouvre
  jamais avec `itinerary = null`.
- **Trajet multi-jambes long** (ex. 3 correspondances = 4 jambes) : réduire
  dynamiquement l'espacement vertical et la taille de police pour que toutes
  les gares tiennent dans `H`; au-delà d'un seuil (ex. > 6 gares), tronquer le
  nom (`ctx.measureText` + ellipse « … ») ou passer à 2 colonnes. Le schéma
  reste linéaire vertical → pas de débordement horizontal.
- **Haute densité d'écran (`devicePixelRatio`)** : canvas multiplié par `scale`
  (min 2×) + `ctx.scale`, garantit un PNG net quel que soit l'écran. Le PNG
  exporté a une taille fixe (ex. 2160×2700 à 2×).
- **Polices françaises accentuées** : les noms de gares sont en majuscules sans
  accents dans `stations.json` (ex. `PARIS (intramuros)`), mais on conserve la
  chaîne d'origine sans `normalize`; la police système (`Segoe UI`, `system-ui`)
  couvre les accents si présents. Vérifier l'affichage des parenthèses/caractères
  spéciaux.
- **Train de nuit / passage à minuit** : si `arr < dep` sur une jambe, afficher
  « +1 » à côté de l'arrivée. V1 : simple indicateur, pas de gestion calendaire.
- **`Itinerary.date` absent** : retomber sur `legs[0].date` ; si tout est absent,
  omettre la date.
- **`navigator.share` non supporté** (Firefox desktop, contexte non-HTTPS, iOS
  sans `canShare` pour fichiers) : fallback automatique vers téléchargement.
- **`toBlob` retourne `null`** (rare) : repli sur `toDataURL` pour le
  téléchargement ; désactiver « Partager ».
- **Aller-retour (`tripKind === 'return'`)** : la carte v1 ne gère que la
  direction active (`directionTab`). Générer un seul sens (voir Open questions).

---

## 6. Effort estimé et risques

- **Effort : M (Moyen)** — ~2 à 3 jours de travail.
  - `postcard.ts` (dessin pur, layout, DPR) : le plus gros du travail.
  - `PostcardModal.tsx` + intégration App.tsx + CSS : léger.
- **Risques** :
  1. **Mise en page canvas chronophage** (alignement texte, centrage, police,
     troncature) — risque de retouches itératives.
  2. **Web Share API fragmenté** (support inégal des `files` entre navigateurs /
     OS) — atténué par le fallback téléchargement.
  3. **Rendu multi-jambes dense** : risque de chevauchement — besoin d'une
     règle de réduction/espacement testée.
  4. **Thème** : deux palettes à maintenir (léger).
  5. **Pas de dépendance d'imagerie** : tout est fait main, pas de lib pour
     faciliter (compensé par le contrôle total).

---

## 7. Open questions

1. **Format** : portrait 4:5 (1080×1350) retenu par défaut — préfère-t-on un
   format paysage (ex. 3:2) ou un format « ticket » ? Multiple formats
   sélectionnables ?
2. **Position du bouton** : bouton dédié dans la sidebar (proposé) vs action
   par carte (`ItineraryList`) — où le placer exactement ?
3. **Mode origine/destination** (`mode === 'origin' | 'destination'`, données
   `Leg`) : hors v1 — faut-il aussi générer une carte postale pour une
   disponibilité sélectionnée (`handleSelect` ne mémorise aujourd'hui qu'un
   `focus`, pas une sélection) ?
4. **Aller-retour** : générer les deux sens sur une seule carte, ou deux cartes ?
5. **Mini-encart géographique** : utiliser `lat`/`lon` de `getStation` pour un
   petit schéma « France » stylisé dans la carte (v2) ?
6. **Titre / branding** : texte figé « TGV MAX » ou personnalisable (nom de
   l'utilisateur, message) ?
7. **Réutiliser `formatDate`/`formatTime`** (définis localement dans `App.tsx`) :
   les extraire vers un module partagé (ex. `src/lib/format.ts`) pour éviter le
   doublon dans `postcard.ts` ?
