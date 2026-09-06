_Fiche d'apprentissage, tenue dans la langue de travail de l'auteur. Ce n'est pas de la documentation
utilisateur : la référence de ce que fait l'outil reste le `README.md`._

# Fiche d'apprentissage, `mcp-migrate-delta`

> Pour la vente orale. Écrite le 06/09/2026, à partir du dépôt public et du dossier de travail
> (`BRIEF.md`, `DECISIONS.md` D-001 à D-012, `INCONNUES.md`, `recherche/`).
> Forme imposée par `00-METHODE.md` du dossier de vente orale : gabarit en cinq fentes, décisions
> avec alternative écartée et seuil de bascule, chiffres encadrés par leur fichier.
> Règle de fond : le modèle écrit, je décide. Les verbes qui portent ce que je vends sont
> cadrer, choisir, refuser, borner, vérifier, mesurer.

---

## La phrase d'une ligne

> « C'est un outil en ligne de commande qui dit ce que la nouvelle révision du protocole MCP casse
> dans un serveur écrit pour l'ancienne, et surtout qui prouve la migration en rejouant la suite de
> conformance officielle avant et après, avec un code de sortie qui échoue sur la moindre
> régression. »

---

## La pile technique, avec le mot exact du marché

| Brique | Le mot du marché | Ce qu'elle fait ici précisément | Fichier |
|---|---|---|---|
| Analyse statique | **analyse par arbre syntaxique, `ts-morph` épinglé 28.0.0** | quatre règles, chacune rattachée à une entrée du changelog `2026-07-28` | `src/rules/` (`sdk-v1-package.ts`, `stateful-handshake.ts`, `removed-methods.ts`, `error-codes.ts`) |
| Correction mécanique | **remplacement sûr, unique** | `-32002` vers `-32602`, la seule réécriture sans jugement de cette migration ; le reste est signalé, pas réécrit | `src/rules/error-codes.ts` l. 30 à 31 |
| Exécution de la suite | **harnais de conformance officiel, version épinglée** | lance `@modelcontextprotocol/conformance` `0.2.0-alpha.11` avec `--requirements` et `-o`, jamais le tag `latest` | `src/verify/runner.ts` ; `package.json`, `dependencies` |
| Sonde de disponibilité | **contrôle amont de la cible, code de sortie 2** | distingue un serveur arrêté d'une régression, la suite renvoyant 1 dans les deux cas | `src/verify/probe.ts` |
| Lecture des résultats | **réconciliation contre le fichier de besoins de la révision** | aligne les `checks.json` produits sur `requirements/<révision>.yaml` et nomme `crashed` tout scénario attendu sans fichier | `src/verify/results.ts`, `src/verify/requirements.ts` |
| Moteur de delta | **différence au niveau du check, porte de non-régression** | corrigés, régressés, encore en échec, apparus, disparus ; sortie 1 sur la moindre régression d'un scénario scoré | `src/verify/diff.ts` |
| Rapports machine | **rapport versionné, types exportés** | `reportVersion` et `kind` (`scan`, `run`, `delta`) ; un consommateur qui voit une version plus haute refuse de deviner | `src/report.ts` |
| Serveurs de référence | **oracle avant et après, même surface métier** | `before` sur `@modelcontextprotocol/sdk` 1.30.0, `after` sur `@modelcontextprotocol/server` 2.0.0, écrits pour être mesurés | `fixtures/before/`, `fixtures/after/` et leurs `README.md` |
| Sonde d'écosystème | **enquête déclarative sur registre public, deux requêtes au plus** | `server/discover` sur le fil `2026-07-28`, puis `initialize` `2025-11-25` jamais suivi ; jamais de `tools/call` | `src/ecosystem/probe.ts`, `src/ecosystem/classify.ts` |
| Tests | **suite hors réseau, plus une suite réseau séparée** | 15 fichiers `*.test.ts`, dont 2 sous `test/network/` qui lancent les deux serveurs et la vraie suite | `test/`, `package.json` (`test`, `test:network`) |
| Intégration continue | **deux jobs, l'un hors réseau, l'autre réseau** | typecheck, build et tests hors réseau sur matrice Node, puis le delta réel sur les fixtures avec conservation des sorties brutes | `.github/workflows/ci.yml` |
| Distribution | **paquet npm public, Apache-2.0 avec `NOTICE`** | publié le 06/09/2026, binaire `mcp-migrate-delta`, Node 22 minimum | `package.json`, `LICENSE`, `NOTICE` |

---

## Le gabarit 60 à 90 secondes, rempli

**Contexte.** Projet personnel, cadré et livré début septembre 2026, seul, en public sur npm sous
Apache-2.0. La révision `2026-07-28` du protocole MCP casse les serveurs écrits pour `2025-11-25`,
et six outils annonçaient déjà la migration au moment où j'ai cadré.

**Problème.** Tous ces outils sont des scanners statiques. Un scanner qui vérifie sa propre
réécriture avec les expressions régulières qui l'ont produite ne vérifie rien. Personne ne rejouait
la suite de conformance officielle avant et après pour montrer ce que la migration ferme réellement.

**Ce que j'ai construit.** Trois briques. Un scanner borné à quatre règles, chacune rattachée à une
entrée du changelog. Un lanceur de la suite officielle, épinglé à une version exacte, qui lit les
fichiers de résultats au lieu de faire confiance au code de sortie. Un moteur de delta qui compare
deux exécutions check par check et échoue sur toute régression.

**La décision dont je suis le plus fier.** Le brief demandait de renuméroter quatre codes d'erreur.
J'ai refusé trois des quatre sur preuve : ces codes ont été introduits par la révision cible, ils
n'existent pas dans l'ancienne, et dans du code 1.x `-32001` est au contraire le délai d'attente du
SDK. Les réécrire aurait été un faux positif garanti. Il reste une seule réécriture sûre, et l'outil
dit que le reste est architectural au lieu de faire semblant.

**Le résultat mesuré.** Sur les deux serveurs de référence livrés dans le dépôt, la suite officielle
donne 36 scénarios scorés en échec avant migration et 0 après, 91 checks corrigés, 0 régression, et
ce delta se relance en une commande devant vous. Sa limite : ce sont mes serveurs, écrits pour être
mesurés. Le premier usage hors fixtures est une mesure d'écosystème sur 30 serveurs publics du
registre, où 0 déclare la révision courante et 19 en annoncent une antérieure.

---

## Cinq décisions revendicables, avec la preuve dans le code

**D1. Refuser la renumérotation des codes d'erreur que le brief demandait.**
Le brief fusionnait deux ruptures en une règle qui aurait réécrit `-32002`, `-32001`, `-32003` et
`-32004`. Je n'en garde qu'une.
Alternative écartée : la règle à quatre réécritures.
Critère : le changelog dit que les trois autres codes ont été « introduced in this draft » et que la
plage `-32000` à `-32019` reste définie par l'implémentation ; dans `@modelcontextprotocol/sdk@1.30.0`,
`-32001` est `RequestTimeout` et la réponse « Session not found » du transport. Réécrire, c'était
casser du code juste.
Seuil de bascule : une révision qui retirerait la clause de tolérance sur la plage implémentation.
Preuve : `DECISIONS.md` D-008 ; `src/rules/error-codes.ts` l. 5 à 14 et l. 30 à 38, qui ne connaît
que `-32002` en correction sûre et `-32042` en `advisory`.

**D2. Borner le scanner à quatre règles, et choisir la preuve par exécution.**
Le concurrent le plus visible en annonce vingt et une. Je m'arrête à quatre et je mets l'effort dans
`verify`.
Alternative écartée : la course à la couverture de règles.
Critère : une règle de plus ne prouve rien de plus, alors que le delta de conformance prouve. Les
ruptures restantes sont soit réglées par le changement de paquet, soit détectables uniquement sur des
serveurs qui construisent leurs propres enveloppes JSON-RPC, ce que j'ai mesuré sur le fil.
Seuil de bascule : une rupture observable sur un serveur bâti sur SDK, avec un faux positif nul sur
la fixture migrée, entre au périmètre.
Preuve : `DECISIONS.md` D-002 et D-005 ; `recherche/I-05-stampage-sdk.md` (les deux SDK officiels
posent `resultType`, `ttlMs` et `cacheScope` seuls, avec ou sans configuration) ; `README.md`,
section « The rules », paragraphe « What is deliberately not a rule ».

**D3. Choisir d'épingler une version alpha exacte plutôt que `latest`.**
La suite est appelée en `0.2.0-alpha.11`, jamais par un tag mouvant.
Alternative écartée : `npx @modelcontextprotocol/conformance@latest`.
Critère : mesuré le 05/09/2026, le tag `latest` pointe sur `0.1.16` (mars 2026), qui ne connaît pas
`--requirements` ; le drapeau naît en `alpha.11`. Un outil qui annonce « la suite officielle » en
laissant flotter la version annonce un résultat que personne n'a exécuté.
Seuil de bascule : une version stable qui expose `--requirements`, et je réépingle dessus, en le
datant dans le changelog.
Preuve : `DECISIONS.md` D-005 ; `recherche/I-01-I-02-conformance.md`, relevé des `dist-tags` ;
`package.json`, `dependencies`, et `src/verify/runner.ts` qui résout le binaire de la dépendance
installée au lieu d'aller chercher le registre.

**D4. Refuser le critère « zéro détection sur le SDK officiel » et le remplacer par la fixture migrée.**
Le brief posait comme critère de validation qu'un scan du SDK TypeScript ne produise aucune détection.
J'ai retiré ce critère.
Alternative écartée : le SDK comme oracle de faux positifs.
Critère : mesure faite, le scan du SDK au commit `5119ee7f` rend 688 détections sur 743 fichiers lus,
dont 539 dans ses fichiers de test. Elles sont légitimes : un SDK implémente les deux ères et doit
contenir les constructions que le scanner cherche. L'oracle correct est un serveur migré, pas une
bibliothèque.
Seuil de bascule : aucune détection sur `fixtures/after` reste la condition de sortie ; une seule
détection sur ce serveur est un défaut à corriger.
Preuve : `DECISIONS.md` D-009 ; `test/scan/fixtures.test.ts` ; `README.md`, section « Scanning the
SDK itself, as a measurement », où le scan du SDK est gardé comme mesure documentée et pas comme test.

**D5. Borner la sonde d'écosystème à deux requêtes, sans méthode à effet.**
Pour mesurer l'adoption sur des serveurs qui ne m'appartiennent pas, je fixe la méthode avant de
mesurer et je m'y tiens.
Alternatives écartées : la sélection des trente serveurs les plus récemment mis à jour, et le
remplacement d'un serveur injoignable par un rang de réserve.
Critères : la règle de récence remontait un tunnel temporaire et trois serveurs d'un même publieur
aux quatre premiers rangs, donc elle ne mesure pas l'écosystème ; remplacer un injoignable aurait
biaisé l'échantillon vers les serveurs vivants et effacé un fait mesuré, une entrée active du
registre qui pointe un domaine mort. La sélection devient déterministe et rejouable : un serveur par
espace de noms, hôte et URL, trié par SHA-256 du nom.
Bornes de la sonde : deux requêtes POST au plus par serveur, jamais de `tools/call`, aucun identifiant,
aucun en-tête `Origin`, aucune nouvelle tentative, 15 s de délai, 5 s de pause, corps borné à 4 Kio,
User-Agent qui nomme le dépôt et la façon de se retirer des passages suivants. Soixante requêtes pour
toute la campagne.
Preuve : `DECISIONS.md` D-011 ; `src/ecosystem/probe.ts` (constantes de délai, de pause et
`DEFAULT_USER_AGENT`) ; `docs/USAGE-REEL.md` ; `docs/ecosystem/selection-2026-09-06.json`.

---

## La démonstration en cinq minutes

Le but n'est pas de montrer du code, c'est de faire tourner la suite officielle devant l'interlocuteur
et de le laisser lire le delta. Depuis un clone du dépôt public.

**0. Préparer, pendant qu'on parle.**

```bash
git clone https://github.com/AmirK-S/mcp-migrate-delta
cd mcp-migrate-delta
npm ci && npm run build
```

Ce que je dis pendant que ça installe : « Deux serveurs sont livrés dans le dépôt, la même surface
métier écrite deux fois, une fois pour chaque révision du protocole. Ce sont eux l'oracle. Tout ce
qu'on va voir sort de la suite de conformance officielle, épinglée à une version exacte, pas d'un
score maison. » Les commandes ci-dessous s'écrivent `mcp-migrate-delta ...` une fois le paquet
installé ; dans le clone, c'est `node dist/cli.js ...`.

**1. Lancer les deux serveurs.**

```bash
PORT=3001 node fixtures/before/src/server.mjs &
PORT=3002 node fixtures/after/src/server.mjs &
```

« Le 3001 est un bon serveur de 2025 : transport à session, poignée de main `initialize`, `ping` et
`logging/setLevel` servis. Le 3002 est le même service migré à la main sur le SDK 2.x. »

**2. Le scan statique, ce qui va casser.**

```bash
mcp-migrate-delta scan fixtures/before
```

Ce qu'on regarde : la ligne d'en-tête, qui dit la révision de départ, la révision d'arrivée, le
nombre de fichiers et le nombre de règles ; puis chaque détection avec sa ligne, sa colonne, sa règle
et l'entrée de changelog entre crochets ; puis le total et la mention des corrections mécaniques
sûres. « Dix détections, quatre règles, et une seule réécriture automatique proposée. C'est
volontaire : le reste est architectural, et je préfère le dire. » Le code de sortie est 1, et la même
commande sur `fixtures/after` affiche « No finding » et sort 0. C'est l'oracle de faux positifs.

**3. La ligne de base, la suite officielle sur le serveur d'avant.**

```bash
mcp-migrate-delta verify --url http://localhost:3001/mcp --report before.json
```

Ce qu'on regarde, dans l'ordre où ça s'affiche : la première ligne nomme la suite, sa version exacte
et la révision demandée ; puis les scénarios scorés, 1 réussi et 36 en échec sur 37 ; puis la ligne
« Not scored », qui ne compte jamais ; puis la ligne qui signale les scénarios sur lesquels la suite
a planté sans écrire de résultat ; puis le regroupement par cause racine. « Cent quarante-cinq checks
en échec, et la première ligne du regroupement les explique : un transport de 2025 refuse toute
requête sans session. Le même serveur passe 30 scénarios sur 30 quand on demande sa propre révision.
C'est un serveur correct, c'est la révision qui a bougé. »

**4. Le delta, sur le serveur migré.**

```bash
mcp-migrate-delta verify --url http://localhost:3002/mcp --baseline before.json --report delta.json
```

Ce qu'on regarde : le bloc « Delta », qui rappelle les deux URL et les deux horodatages, puis la ligne
« Scored scenarios failing: 36 before, 0 after », puis la ligne des checks, « 91 fixed, 0 regressed,
0 still failing, 9 added, 4 removed ». « Neuf apparus et quatre disparus, parce que les deux surfaces
ne peuvent pas être identiques : les outils d'élicitation deviennent des résultats en plusieurs
allers-retours, et la ressource abonnée disparaît avec `resources/subscribe`. Le chiffre que je
revendique, c'est 91 corrigés, 0 régressé. Le code de sortie est 0 parce qu'aucun check n'a régressé ;
il serait à 1 sur un seul check cassé, même si tout le reste s'améliore. C'est une porte de
non-régression, pas un badge de conformité. »

**5. Si la question vient sur le monde réel.**

```bash
cat docs/ecosystem/2026-09-06.md
```

« Trente serveurs publics du registre, tirés par hachage, sondés en deux requêtes chacun. Zéro
déclare la révision courante, quarante jours après sa sortie. Dix-neuf en négocient une antérieure,
sept sont derrière une authentification et ne disent rien, un est injoignable. C'est une déclaration
de version, pas une conformité : un serveur qui déclare devrait encore passer la suite. »

Fermeture : « Ce que vous venez de voir, ce n'est pas mon score, c'est celui de la suite officielle.
Mon travail, c'est le cadrage, les quatre règles, ce que j'ai refusé de détecter, et la lecture des
fichiers de résultats à la place du code de sortie. »

---

## Les huit questions les plus probables

**1. « Vous avez codé ça ? »**
Écrit par un agent, spécifié et vérifié par moi, comme chez vous. Ce qui est à moi, ce sont les
décisions écrites et datées dans un fichier dédié, douze au total, dont trois contredisent mon propre
brief sur preuve. Ce qui est vérifiable, c'est que chaque refus porte sa mesure : le code qui montre
pourquoi la renumérotation aurait été fausse, le relevé de `dist-tags` qui montre pourquoi la version
est épinglée.

**2. « Comment savez-vous que la migration a marché ? »**
Je ne me crois pas moi-même : je fais tourner la suite de conformance officielle avant et après, et
je compare check par check. Trente-six scénarios scorés en échec avant, zéro après, 91 checks
corrigés, zéro régression, dans `.mcp-migrate-delta/delta.json` produit par `npm run test:network`.
La limite est que les deux serveurs sont les miens, écrits pour être mesurés, donc c'est une
démonstration du dispositif, pas une preuve d'adoption.

**3. « Pourquoi épingler une version alpha, c'est fragile. »**
C'est fragile dans les deux sens, et j'ai choisi la fragilité visible. Le tag `latest` de la suite
pointait sur une version de mars 2026 qui ne connaît pas le drapeau `--requirements` : en le suivant,
j'aurais annoncé une mesure que personne n'exécute. Épinglé, je sais exactement ce qui a tourné, et
la mise à jour est un commit daté dans le changelog.

**4. « Quatre règles, quand un autre outil en annonce vingt et une. »**
Oui, et c'est le point. Les règles restantes sont soit réglées d'office par le changement de paquet,
soit indétectables sans faux positif sur un serveur bâti sur un SDK officiel, ce que j'ai vérifié sur
le fil avant de trancher. Le différenciateur n'est pas le nombre de règles, c'est que je prouve le
résultat par exécution, ce que les scanners existants ne font pas.

**5. « Votre delta est mesuré sur vos propres serveurs. C'est du sur-mesure. »**
C'est exact, et c'est écrit dans le README avant qu'on me le demande. Les fixtures sont un oracle,
pas une clientèle. Le premier usage hors fixtures est la mesure d'écosystème du 06/09, où la sonde a
cassé trois fois sur des cas réels que mes serveurs ne produisaient pas, et ces trois corrections
sont tracées dans `docs/USAGE-REEL.md`.

**6. « Zéro sur trente, c'est un échantillon de rien. »**
Trente sur 10 027 candidats, tirés par SHA-256 du nom pour que la sélection soit rejouable, avec sept
serveurs derrière authentification qui ne disent rien ni dans un sens ni dans l'autre. Ce que je
revendique, c'est ce qui est lisible : sur les dix-neuf endpoints qui répondent, aucun ne déclare la
révision courante quarante jours après sa sortie. La sélection, la méthode et les corps de réponse
tronqués sont dans le dépôt, donc n'importe qui peut refaire le tirage.

**7. « Que se passe-t-il quand la révision suivante sort ? »**
L'outil devient obsolète, et le README l'écrit en tête. Il est daté : il vise `2026-07-28` et une
version exacte de la suite. `verify` continuera de mesurer cette révision tant que la suite livre son
fichier de besoins figé, et les règles resteront vraies sur du code `2025-11-25` sans rien dire de la
révision nouvelle. La politique de cycle de vie adoptée dans cette révision fixe une fenêtre de
dépréciation d'au moins douze mois, ce qui donne l'horizon.

**8. « Quel a été le plus gros problème ? »**
Le silence de la suite, pas la syntaxe. Un scénario sur lequel la suite plante crée son dossier de
résultats et n'écrit jamais son fichier de checks : compter les dossiers donne cinquante sur
cinquante et paraît complet, compter les fichiers révèle le trou. Je l'ai trouvé en réconciliant les
fichiers contre le fichier de besoins de la révision, pas en relisant le code. La règle que j'en
tire : ne jamais faire confiance à un dénominateur qu'on n'a pas construit soi-même.

---

## Les trois questions pièges

**Piège 1. « Donc votre outil migre le serveur. »**
Non, et il ne faut jamais laisser passer le raccourci. Il n'y a pas de commande `fix` : la seule
réécriture mécanique sûre de cette migration est `-32002` vers `-32602`, tout le reste est
architectural. Les fixtures ont été migrées à la main, la réécriture de la surface SDK est faite par
le codemod officiel, dont le README dit lui-même que l'adoption du protocole n'est pas automatisable.
Ma phrase : « il mesure et il prouve, il ne réécrit pas ».

**Piège 2. « Zéro serveur conforme sur trente, donc l'écosystème n'est pas prêt. »**
Le mot « conforme » n'est pas le mien et je le reprends à chaque fois. Un verdict enregistre ce qu'un
serveur déclare, pas ce qu'il respecte : un serveur qui déclarerait la révision courante devrait
encore passer la suite pour être dit conforme. Sept serveurs sur trente sont illisibles derrière une
authentification, trois ne sont pas des endpoints MCP ce jour-là. La mesure porte sur ce qui a
répondu, et elle est datée.

**Piège 3. « Un concurrent lance déjà la suite officielle, votre écart est mince. »**
Il est mince et je le dis avant qu'on le trouve : un outil publié début septembre lance bien la suite
officielle épinglée, et sait par ailleurs comparer deux exécutions. Mais il lance la suite en laissant
la sortie filer au terminal, ne lit que le code de sortie, et sa comparaison porte sur sa note maison,
pas sur les scénarios de la suite. L'écart est d'un après-midi de travail pour son auteur, c'est écrit
dans mon dossier de recherche. Ce que je vends n'est donc pas le fait de lancer la suite, c'est le
delta au niveau du check et la lecture des fichiers que la suite laisse derrière elle.

---

## Ce que je referais autrement

Générer les chiffres du README depuis les fichiers JSON plutôt que de les recopier à la main. La
relecture avant publication a trouvé un chiffre faux dans la section qui mesure le scan du SDK, et
c'était le seul chiffre du dépôt qui ne résistait pas à un recomptage : il ne correspondait à aucun
découpage réel du fichier de scan. Le fond était juste, la saisie ne l'était pas. Sur un projet dont
l'argument central est « je mesure au lieu de croire », un chiffre recopié à la main est la seule
chose que personne ne vérifie, et c'est exactement là que l'erreur est allée se loger. Un petit script
qui écrit ces lignes depuis `sdk-scan.json` aurait coûté vingt minutes.

Deuxième chose, plus petite : le nom du binaire est long à taper en démonstration. Je le garde parce
qu'il porte le mot que les gens cherchent et le différenciateur, mais je prévois un alias local avant
toute démonstration.

---

## Vocabulaire

**À employer :** révision de protocole · suite de conformance officielle · scénario scoré · check ·
delta au niveau du check · ligne de base · porte de non-régression · code de sortie distinct pour un
serveur injoignable · scénario planté sans fichier de résultat · scénario vert à zéro check · cause
racine · oracle de faux positifs · fixture migrée · épinglage de version exacte · correction mécanique
sûre · verdict déclaratif · sélection déterministe par hachage · sonde à deux requêtes · outil daté ·
rapport versionné.

**À éviter :** « outil de migration » tout court, il ne réécrit pas · « conforme » à propos des trente
serveurs du registre, ils déclarent · « le seul outil qui... », un concurrent lance déjà la suite ·
« j'ai codé », « j'ai implémenté » · un compte de tests non relancé le matin même · présenter les 688
détections sur le SDK comme des faux positifs, ce sont des détections légitimes sur une bibliothèque
qui sert les deux ères · présenter le scénario vert à zéro check comme un défaut ignoré en amont, la
politique est documentée et assumée · le nom des personnes qui maintiennent les dépôts en amont ·
« la niche est vide », elle ne l'était déjà plus au moment du cadrage.

---

## Trous à combler

1. **Un usage par quelqu'un d'autre que moi.** Le paquet est publié depuis le 06/09/2026 ; tant
   qu'aucun dépôt tiers ne l'a lancé, la phrase honnête est « publié et mesuré sur ses propres
   serveurs de référence », pas « utilisé ».
2. **La suite de tests, à relancer le matin d'un entretien.** Le nombre exact se dit après
   `npm test`, jamais de mémoire. Ce qui est stable et vérifiable à froid : 15 fichiers de test,
   dont 2 sous `test/network/`.
3. **La réponse des mainteneurs amont.** Deux commentaires factuels ont été postés le 06/09/2026 sur
   les issues #486 et #451 du dépôt `modelcontextprotocol/conformance`, avec la divulgation d'usage
   d'IA que la politique de l'organisation impose. Sans réponse, ils se citent comme une contribution
   envoyée, pas comme une contribution acceptée.
4. **La compétence d'agent de la 0.2.0.** Décidée et cadrée, pas écrite. Se dit « décidée », jamais
   « livrée ».

---

<sub>relevé du 06/09/2026 sur le dépôt : `README.md` · `CHANGELOG.md` · `docs/USAGE-REEL.md` ·
`docs/LIGNE-CV.md` · `docs/ecosystem/2026-09-06.md` · `src/rules/` (4 règles) · `src/verify/`
(`runner.ts`, `probe.ts`, `results.ts`, `requirements.ts`, `diff.ts`) · `src/ecosystem/`
(`probe.ts`, `classify.ts`) · `fixtures/before/README.md`, `fixtures/after/README.md` · `test/`
(15 fichiers, dont 2 réseau) · `.github/workflows/ci.yml`</sub>

<sub>dossier de travail : `BRIEF.md` · `DECISIONS.md` D-002, D-005, D-008, D-009, D-011, D-012 ·
`INCONNUES.md` · `recherche/I-01-I-02-conformance.md` · `recherche/I-05-stampage-sdk.md` ·
`recherche/I-09-migration-par-agent.md` · `recherche/I-12-concurrents-verify.md` ·
`recherche/fixtures-mesure.md` · `recherche/relecture-finale.md`</sub>

<sub>méthode : `00-METHODE.md` du dossier de vente orale</sub>
</content>
</invoke>
