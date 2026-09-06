# Usage réel

Trace des exécutions de `mcp-migrate-delta` sur des cas qui ne sont pas ses propres fixtures.
Une entrée par campagne : commande, date, ce qui s'est passé, ce qui a cassé, ce qui a été corrigé.

## 06/09/2026, trente serveurs publics du registre officiel

**Commande.**

```bash
npm run build
node scripts/measure-ecosystem.mjs docs/ecosystem/selection-2026-09-06.json docs/ecosystem
```

**Ce qui s'est passé.** Trente serveurs sondés en 137 s de requêtes, plus les pauses de
courtoisie. Aucun ne déclare `2026-07-28`. Dix-neuf négocient une révision antérieure sur
`initialize` (dix en `2025-11-25`, cinq en `2025-06-18`, trois en `2024-11-05`, une en
`2025-03-26`), sept exigent une authentification, trois répondent 404 avec un corps JSON aux deux
requêtes, un est injoignable. Détail par serveur dans `docs/ecosystem/2026-09-06.md` et
`docs/ecosystem/2026-09-06.json`.

**Ce qui a cassé.**

- La sélection « trente serveurs les plus récemment mis à jour » donnait un tunnel temporaire et
  trois serveurs du même publieur aux quatre premiers rangs. Remplacée par un serveur par espace de
  noms, hôte et URL, trié par SHA-256 du nom.
- La première version de la sonde lisait un serveur qui répond 200 puis garde le flux ouvert comme
  « injoignable » : le délai d'abandon frappait pendant la lecture du corps. Corrigé : les en-têtes
  reçus font une réponse, quoi qu'il arrive au corps.
- Un `403` nu est aussi le refus d'un `Origin` invalide dans le transport ; il n'est plus lu comme un
  refus d'authentification sans `WWW-Authenticate`. La sonde n'envoie aucun `Origin`.
- Un serveur a répondu `402` à `server/discover` puis a négocié `initialize` : classé `legacy`, le
  statut est conservé dans le rapport.
- Onze serveurs répondent à `server/discover` par `-32601 Method not found` avec un HTTP 200 :
  ce n'est pas la forme moderne (404 plus `-32601`), donc ils sont classés par leur `initialize`,
  pas comme « moderne sans discover ».

**Ce qui a été corrigé dans l'outil.** Voir le CHANGELOG, section Unreleased : verdicts
`modern-other-revision`, `modern-no-discover`, `rate-limited`, pauses, corps borné à 4 Kio.
