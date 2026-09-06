# Post LinkedIn

Brouillon écrit par la session projet. Il ne se publie qu'après relecture par le contrôleur du
dossier de prospection (`recherche/outils/verifier-message.py --type message --stade premier
--canal fr`). Aucune tournure de crochet, aucun tiret cadratin, deux mots-dièse au plus.

## Français (884 caractères)

La révision 2026-07-28 du Model Context Protocol supprime le handshake initialize, les sessions et
quatre méthodes. Un serveur écrit pour 2025-11-25 échoue à 36 scénarios sur 37 de la suite de
conformance officielle, pour une seule cause : son transport refuse toute requête sans session.

J'ai publié mcp-migrate-delta, un outil qui dit ce qui casse dans un serveur TypeScript, puis qui
prouve la migration en rejouant la suite officielle avant et après, check par check, avec un code de
sortie qui échoue sur toute régression. Sur les deux serveurs de référence livrés : 36 scénarios en
échec avant, 0 après.

Au passage, une mesure sur 30 serveurs publics du registre officiel : aucun ne déclare encore la
révision courante, quarante jours après sa sortie.

Apache-2.0, méthode et chiffres bruts dans le dépôt.
https://www.npmjs.com/package/mcp-migrate-delta

#MCP #AgentEngineering

## English (858 characters)

Revision 2026-07-28 of the Model Context Protocol removes the initialize handshake, sessions and
four methods. A server written for 2025-11-25 fails 36 of the 37 scenarios of the official
conformance suite, for one cause: its transport refuses every request without a session.

I published mcp-migrate-delta, a tool that says what breaks in a TypeScript server, then proves the
migration by replaying the official suite before and after, check by check, with an exit code that
fails on any regression. On the two bundled reference servers: 36 failing scenarios before, 0 after.

Along the way, a measurement on 30 public servers of the official registry: none declares the
current revision yet, forty days after it shipped.

Apache-2.0, method and raw numbers in the repository.
https://www.npmjs.com/package/mcp-migrate-delta

#MCP #AgentEngineering
