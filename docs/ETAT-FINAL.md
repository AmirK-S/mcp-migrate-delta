_Closing note, kept in the maintainer's working language. The README is the reference for what
the tool does; this file says what state the project is left in and what would reopen it._

# État final, 06/09/2026

## Versions épinglées

| Quoi | Version | Où |
| --- | --- | --- |
| `mcp-migrate-delta` | 0.2.2 | npm `https://www.npmjs.com/package/mcp-migrate-delta` (0.1.0, 0.2.0, 0.2.1, 0.2.2 le 06/09/2026) ; tags git `v0.1.0` à `v0.2.2` |
| Révision de spécification visée | `2026-07-28` | `src/rules/*`, `src/ecosystem/probe.ts`, `src/ecosystem/classify.ts` |
| `@modelcontextprotocol/conformance` | `0.2.0-alpha.11`, exacte | `package.json`, `skill/SKILL.md` ; `src/verify/requirements.ts` lit la version installée à l'exécution |
| `ts-morph` | `28.0.0` | `package.json` |
| `@modelcontextprotocol/sdk` (fixture avant) | `1.30.0` | `fixtures/before/package.json` |
| `@modelcontextprotocol/server` et `node` (fixture après) | `2.0.0` | `fixtures/after/package.json` |
| Node | 22 et 24 pour les tests hors réseau, 22 seul pour le job réseau, `>=22` déclaré | `.github/workflows/ci.yml`, `package.json` |

## Note de fin de vie et signaux à surveiller

L'outil est daté d'une révision. Il devient obsolète, ou doit être remesuré, sur l'un de ces
signaux :

- Une entrée dans `docs/specification/draft/changelog.mdx` du dépôt de spécification, vide au
  SHA `e76e9c57` lu le 05/09/2026, ou une SEP en revue touchant `server/discover`, le `_meta` de
  version, `resultType`, `ttlMs`, `cacheScope`, les codes `-32020` à `-32022`,
  `subscriptions/listen` ou le motif MRTR. La politique SEP-2596 pose un plancher de douze mois
  de dépréciation, quatre-vingt-dix jours en retrait accéléré ; le registre des dépréciations
  date au plus tôt du 28/07/2027 le retrait de Roots, Sampling, Logging et DCR.
- Une nouvelle version de `@modelcontextprotocol/conformance` : la sélection de scénarios ou le
  schéma de `checks.json` peut changer. Réépingler, relancer `npm run test:network`, remesurer les
  fixtures, mettre à jour le README.
- Une version 2.x publiée sous le nom `@modelcontextprotocol/sdk` : la règle `sdk-v1-package`
  lirait un intervalle ouvert comme 1.x, voir le commentaire dans `src/rules/sdk-v1-package.ts`.
- Un `2.x` du SDK qui retire `SubscribeRequestSchema` ou le chemin legacy : la remédiation de
  `resource-subscriptions` change.
- Le tag npm `latest` de la suite qui passe enfin sur une 0.2 : le paragraphe du README sur
  `0.1.16` devient faux.

## Politique d'issues

Écrite dans le README, section « Issues » : réponse sous sept jours, correction des bogues
reproductibles, aucun engagement de fonctionnalité. La section « Ecosystem measurement » dit que
tout opérateur d'un serveur listé dans `docs/ecosystem/` peut demander par issue d'être exclu des
mesures suivantes.

## Dettes

Aucune issue ouverte au 06/09/2026. Ce qui ne sera pas fait, et pourquoi :

- **Backend Python** : `mcp-migrate` sur PyPI couvre déjà Python à 21 règles ; la valeur de ce
  projet est `verify`, qui ne dépend pas du langage du serveur.
- **Règles sur `resultType`, `ttlMs`, `cacheScope`** : les deux SDK les stampent ; une règle ne
  tirerait que sur des enveloppes construites à la main (D-002).
- **Renumérotation `-32001`, `-32003` et `-32004`** : ces trois codes sont nés dans la révision
  `2026-07-28` et n'existent pas en `2025-11-25` ; `-32002`, lui, y existe et la règle `error-codes`
  le réécrit en `-32602` (D-008).
- **Rapport JUnit** : la suite amont n'a pas de sortie machine pour un simple run serveur ; le
  sujet est porté sur l'issue #486 du dépôt `conformance`, qui décidera.
- **Remplacement d'un serveur injoignable dans la mesure d'écosystème** : refusé, il biaiserait
  l'échantillon (`docs/USAGE-REEL.md`).
- **Suivre les redirections dans la sonde** : non fait ; un serveur qui redirige est classé
  `other` avec son statut, ce qui reste lisible dans le rapport.
- **Renommer `skill/` en `skills/mcp-migrate-delta/`** : non fait ; le paquet publie `skill/` et
  le chemin est cité par le README et la compétence.
- **Entrée au registre MCP officiel** : sans objet, `mcp-migrate-delta` est un outil en ligne de
  commande et non un serveur MCP ; le registre ne liste que des serveurs.

## Livrables de l'annexe

- Usage réel tracé : `docs/USAGE-REEL.md`, mesure sur trente serveurs publics du registre.
- La ligne de CV, le post et la fiche de préparation orale existent mais ne sont pas des documents
  de ce dépôt : ils vivent dans le dossier de travail de l'auteur, hors dépôt public, comme pour
  les projets voisins.

## Traces publiques

- Dépôt : `https://github.com/AmirK-S/mcp-migrate-delta`
- Paquet : `https://www.npmjs.com/package/mcp-migrate-delta`
- Commentaires amont : issues #486 et #451 de `modelcontextprotocol/conformance`, postés le
  06/09/2026 avec divulgation de l'assistance IA.

## Pour rouvrir

Cloner, `npm ci`, `npm run typecheck`, `npm test`, `npm run test:network`. Si le dernier échoue,
c'est l'un des signaux ci-dessus qui a joué ; lire la sortie de `verify`, elle nomme la cause.
