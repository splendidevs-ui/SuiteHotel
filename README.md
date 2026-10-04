# 🏨 SuiteHotel — Gestion d'hôtel de luxe

Application de réception pour les hôtels de prestige : **réservation d'une ou plusieurs chambres**,
planning, check-in / check-out, **devis** transformables en réservation, **reçus** numérotés,
note de séjour, et **restauration en option** (carte, additions, room service, formules repas).

---

## Démarrage rapide

```bash
npm install
npm run setup     # crée la base SQLite + jeu de démonstration
npm run dev       # http://localhost:3300
```

Depuis une tablette ou un autre poste de la réception (même Wi-Fi), ouvrez l'adresse « Network »
affichée par `npm run dev` (par exemple `http://192.168.1.20:3300`).

**Comptes de démonstration** — mot de passe `demo1234` pour tous

| Rôle      | Nom           | Fonction               | E-mail                      |
| --------- | ------------- | ---------------------- | --------------------------- |
| Direction | Aïcha Diabaté | Directrice générale    | `direction@suitehotel.ci`   |
| Réception | Koffi Brou    | Chef de réception      | `koffi.brou@suitehotel.ci`  |
| Réception | Mariam Koné   | Réceptionniste         | `mariam.kone@suitehotel.ci` |
| Réception | Serge Yao     | Réceptionniste de nuit | `serge.yao@suitehotel.ci`   |

La démonstration (hôtel « Le Palais Ébène », Abidjan) est construite autour de la date du jour :
clients en séjour, arrivées et départs du jour (dont un solde à encaisser), réservations à venir,
une réservation issue d'un devis, des devis à tous les statuts, des reçus (dont un annulé) et des
additions du restaurant. Hors production, la page de connexion propose ces comptes en un clic.

### Démarrer avec une base vide

```bash
npm run db:push   # crée la base, sans données
npm run dev       # http://localhost:3300 ouvre l'écran « Installation »
```

L'installation crée la fiche de l'hôtel et le compte de la direction, qui crée ensuite les
catégories de chambres, les chambres et les comptes de la réception.

---

## Fonctionnalités

### Réception

- **Connexion personnelle** (e-mail + mot de passe), session de 12 heures : les postes de la
  réception sont partagés.
- **Tableau de bord** : occupation du soir, arrivées et départs du jour (check-in / check-out en un
  clic, clients en retard signalés), encaissements du jour et du mois, prochaines arrivées.
- **Planning** sur 14 jours : une ligne par chambre, un bandeau par séjour (VIP signalés) ; une case
  libre ouvre une réservation pré-remplie. Chambres occupées par jour en bas du planning.
- **Réservation en trois étapes, conservée en session** : 1. les **chambres** (une ou plusieurs,
  par catégorie, avec leur disponibilité), 2. le **séjour** (dates **et heures** d'arrivée et de
  départ, formule, occupants et tarif
  négociable par chambre ; une chambre déjà prise sur ces dates est signalée), 3. le **client**
  (fiche existante ou nouvelle) et l'acompte éventuel, puis confirmation. Chaque modification est
  enregistrée dans la session de la réceptionniste : on peut changer d'étape, recharger la page ou
  consulter le planning et revenir (« Reprendre la réservation »), rien n'est perdu. Rien n'est
  réservé avant la confirmation ; « Abandonner » ou la déconnexion efface la réservation en cours.
  Une case libre du planning ajoute la chambre à la réservation en cours et ouvre l'étape Séjour.
- **Fiche réservation** : note de séjour détaillée (hébergement, formule, prestations, additions du
  restaurant), TVA, taxe de séjour, réglé / reste à payer, PDF de la note, prestations ajoutées
  pendant le séjour, encaissements, annulation avec motif.
- **Clients** : fiche (coordonnées, pièce d'identité, préférences, VIP), historique des séjours et
  devis, total réglé. Un client déjà connu est retrouvé automatiquement à la réservation.
- **Chambres** : état du jour (libre, arrivée prévue, occupée, départ prévu, hors service), mise
  hors service avec motif.

### Devis

- Devis **par catégorie de chambre** (« 3 chambres Prestige »), formule, prestations (salle de
  séminaire, transferts…), validité et conditions. Disponibilité indicative affichée en direct.
- Numérotation annuelle `DEV-2026-0001`, statuts Brouillon → Envoyé → Accepté / Refusé ; « Expiré »
  s'affiche quand la validité d'un devis envoyé est dépassée.
- Aperçu à l'écran, **PDF A4** (cadre « Bon pour accord », montant en toutes lettres), impression.
- **Transformer en réservation** : des chambres libres de chaque catégorie sont attribuées, tarifs,
  formule, taxes et prestations sont repris à l'identique. Refusé s'il manque des chambres.

### Reçus

- Chaque encaissement (acompte, solde, addition du restaurant) émet un **reçu numéroté**
  `REC-2026-0001` : payeur, montant en chiffres et en lettres, mode de règlement (espèces, carte,
  Mobile Money, virement, chèque), référence, caissier, **reste à payer** après ce règlement.
- Reçu imprimable et **PDF A5 paysage**.
- Liste filtrable (aujourd'hui, 7 jours, mois, tout · par mode) avec **totaux par mode de règlement**.
- Un reçu n'est **jamais supprimé** : la direction peut l'annuler avec un motif ; il reste visible,
  barré, et n'est plus compté. Une addition réglée par un reçu annulé redevient à encaisser.

### Restauration (option)

- Activable dans **Paramètres** ; désactivée, le menu Restaurant disparaît et seules les
  réservations « Chambre seule » sont proposées.
- **Formules** des séjours : petit-déjeuner, demi-pension, pension complète (prix par personne et
  par nuit ; une formule à 0 n'est pas proposée).
- **Carte** par rubriques, plats signalés « épuisés » par la salle.
- **Additions** par table ou room service : portées sur la note d'un client en séjour (montant HT,
  TVA calculée sur la note) ou encaissées directement (reçu).

### Direction

- **Équipe** : création de comptes, rôles, désactivation (sessions fermées immédiatement),
  réinitialisation de mot de passe. Il reste toujours au moins une direction active.
- **Paramètres** : fiche de l'hôtel (en-tête et mentions des documents : RCCM, N° CC, banque),
  TVA, taxe de séjour, heures d'arrivée et de départ, validité et conditions des devis, restauration.
- **Chambres** : catégories (tarif, capacité, surface, literie, prestations) et chambres.
- **Annulation des reçus.**

---

## Règles de gestion

1. **Disponibilité** : un séjour occupe les nuits `[arrivée, départ[` ; le jour du départ d'un
   client, sa chambre peut accueillir une arrivée. Seules les réservations confirmées ou en cours
   bloquent une chambre. Le serveur revérifie tout dans une transaction à l'enregistrement.
2. **Montants** : hébergement (nuits × tarif) + formule (personnes × nuits × prix) + prestations +
   restaurant = total HT ; TVA sur le HT ; taxe de séjour par chambre et par nuit, hors TVA.
   Formule, TVA et taxe de séjour sont **figées à la réservation** : un changement de tarif ne
   modifie pas les séjours déjà vendus.
3. **Check-in** possible à partir du jour d'arrivée, si les chambres sont en service et libérées par
   le client précédent. **Check-out** refusé tant qu'il reste un solde ou une addition ouverte.
4. **Numérotation** annuelle et continue (`RES-`, `DEV-`, `REC-`, `CMD-`) : l'incrément fait partie
   de la transaction, un enregistrement refusé ne consomme pas de numéro.
5. Un encaissement ne peut pas dépasser le reste à payer.

---

## Architecture

```
prisma/
├── schema.prisma          Hotel, User, RoomType, Room, Guest, Reservation(+Room), Charge,
│                          Quote(+Room, +Extra), Receipt, MenuItem, RestaurantOrder(+Line), Counter
└── seed.ts                Jeu de démonstration daté autour d'aujourd'hui
scripts/
├── run-smoke.mjs          Lance le test de bout en bout sur une base temporaire
└── smoke-test.ts          Règles métier : disponibilité, montants, check-out, reçus, devis, PDF…
src/
├── proxy.ts               Redirige vers /connexion sans cookie de session
├── app/
│   ├── (auth)/            Connexion de la réception, installation
│   └── (app)/             Espace connecté : tableau de bord, planning, reservations, devis,
│                          recus, clients, chambres, restaurant, equipe, parametres
├── components/            Formulaires (réservation, devis, client), aperçus des documents…
└── lib/
    ├── reservations.ts    Réservations, check-in / check-out, prestations
    ├── availability.ts    Chambres libres sur une période
    ├── folio.ts           Note de séjour et lignes des documents
    ├── quotes.ts          Devis et transformation en réservation
    ├── receipts.ts        Encaissements, reçus, annulation
    ├── restaurant.ts      Additions et carte
    ├── stay-math.ts       Calcul des montants (partagé formulaire / serveur)
    ├── number-words.ts    Montant en toutes lettres
    ├── pdf.ts             Devis, note de séjour et reçu (pdf-lib)
    └── queries.ts         Lectures : tableau de bord, planning, listes
```

Stack : Next.js 16 (App Router, server actions), React 19, Prisma 6 + SQLite, Tailwind CSS 4,
Zod, bcryptjs, pdf-lib.

---

## Scripts

| Commande             | Rôle                                                        |
| -------------------- | ----------------------------------------------------------- |
| `npm run dev`        | Serveur de développement (port 3300)                        |
| `npm run build`      | Build de production                                         |
| `npm start`          | Serveur de production (port 3300)                           |
| `npm run setup`      | Crée la base et charge la démonstration                     |
| `npm run db:seed`    | **Efface** les données puis recharge la démonstration       |
| `npm run db:push`    | Applique le schéma Prisma à la base                         |
| `npm run db:studio`  | Explorateur de la base (Prisma Studio)                      |
| `npm test`           | Tests unitaires (montants d'un séjour, montant en lettres)  |
| `npm run test:smoke` | Test de bout en bout sur une base temporaire                |
| `npm run typecheck`  | Vérification TypeScript                                    |

---

## Mise en production

- **Base de données** : passer le `provider` de `prisma/schema.prisma` à `postgresql` et renseigner
  `DATABASE_URL` (aucun modèle à modifier : statuts et rôles sont des chaînes). Avec PostgreSQL,
  ajouter une contrainte d'exclusion sur les séjours pour garantir la disponibilité même sous forte
  concurrence (SQLite sérialise les écritures, ce qui suffit en développement).
- **HTTPS obligatoire** : le cookie de session est marqué `Secure` en production.
- **Fuseau horaire** : `NEXT_PUBLIC_TIME_ZONE` (par défaut `Africa/Abidjan`) date « aujourd'hui »
  (arrivées, départs, numérotation) et l'heure des encaissements.
- **Devise** : à choisir dans Paramètres **avant** de saisir les tarifs ; elle est ensuite verrouillée.
- Prévoir des **sauvegardes** régulières de la base.

## Limites connues

- Toutes les chambres d'une réservation partagent les mêmes dates ; pour des dates différentes,
  créer plusieurs réservations.
- Une réservation n'est modifiable qu'avant l'arrivée ; un départ anticipé n'ajuste pas les nuits
  facturées (ajouter un geste commercial via le tarif avant l'arrivée, ou un avoir hors application).
- Pas de facture distincte : la note de séjour et les reçus en tiennent lieu. Pas d'envoi par e-mail
  ni de connexion aux plateformes de réservation (OTA).
- Pas de limitation des tentatives de connexion : à ajouter avant une exposition sur Internet.
