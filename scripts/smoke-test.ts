/**
 * Test de bout en bout des regles metier (sans navigateur), sur une base dediee :
 *
 *   npm run test:smoke
 *
 * Reservation multi-chambres et acompte, disponibilite, capacite, check-in /
 * check-out, prestations, restaurant porte sur la note, recus et annulation,
 * devis transforme en reservation, parcours de reservation en etapes, PDF.
 */
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import type { SessionUser } from "../src/lib/auth";
import { applyRoomsStep, applyStayStep, confirmDraft } from "../src/lib/booking";
import { mergeDraft, newBookingDraft } from "../src/lib/booking-draft";
import { db } from "../src/lib/db";
import { getFolio, quoteLines } from "../src/lib/folio";
import { addDaysToDateInput, todayDateInput } from "../src/lib/format";
import { generateFolioPdf, generateQuotePdf, generateReceiptPdf } from "../src/lib/pdf";
import { getQuote, getReceipt } from "../src/lib/queries";
import { changeQuoteStatus, convertQuote, createQuote } from "../src/lib/quotes";
import { cancelReceipt, recordPayment } from "../src/lib/receipts";
import {
  addCharge,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  createReservation,
} from "../src/lib/reservations";
import { addOrderItem, chargeOrderToRoom, createOrder, payOrder } from "../src/lib/restaurant";

async function step(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`✔ ${name}`);
}

function expectError(result: { ok: boolean } & ({ error: string } | object), pattern: RegExp) {
  assert.equal(result.ok, false, "l'opération aurait dû être refusée");
  assert.match("error" in result ? result.error : "", pattern);
}

const T = todayDateInput();
const d = (n: number) => addDaysToDateInput(T, n);

async function main() {
  // Garde-fou : ce test cree des donnees fictives, jamais dans une vraie base.
  if (!process.env.DATABASE_URL?.includes("suitehotel-smoke-")) {
    throw new Error("Ce test s'exécute sur une base temporaire : lancez-le avec `npm run test:smoke`.");
  }

  await db.hotel.create({
    data: {
      id: "main",
      name: "Hôtel Test",
      vatRate: 18,
      cityTax: 2_000,
      breakfastPrice: 25_000,
      halfBoardPrice: 60_000,
      fullBoardPrice: 95_000,
      restaurantEnabled: true,
    },
  });
  const makeUser = async (name: string, role: SessionUser["role"]): Promise<SessionUser> => {
    const u = await db.user.create({ data: { name, email: `${name.split(" ")[0].toLowerCase()}@smoke.test`, role, passwordHash: "x" } });
    return { id: u.id, name: u.name, email: u.email, role, jobTitle: null };
  };
  const director = await makeUser("Direction Test", "DIRECTION");
  const desk = await makeUser("Reception Test", "RECEPTION");

  const deluxe = await db.roomType.create({ data: { name: "Deluxe", capacity: 2, basePrice: 185_000 } });
  const suite = await db.roomType.create({ data: { name: "Suite", capacity: 3, basePrice: 350_000 } });
  const room = async (number: string, typeId: string, outOfService = false) =>
    (await db.room.create({ data: { number, floor: 1, roomTypeId: typeId, outOfService } })).id;
  const r101 = await room("101", deluxe.id);
  const r102 = await room("102", deluxe.id);
  const r301 = await room("301", suite.id);
  const r106 = await room("106", deluxe.id, true);
  const dish = await db.menuItem.create({ data: { name: "Plat du jour", category: "PLAT", price: 38_000 } });

  const newGuest = {
    mode: "new",
    firstName: "Awa",
    lastName: "Test",
    email: "awa@smoke.test",
    phone: "",
    nationality: "",
    idType: "",
    idNumber: "",
    company: "",
  };
  const stay = (rooms: { roomId: string; adults: string; children?: string; nightlyRate?: string }[], from: number, to: number, extra = {}) => ({
    guest: newGuest,
    checkIn: d(from),
    checkOut: d(to),
    mealPlan: "CHAMBRE_SEULE",
    source: "DIRECT",
    notes: "",
    rooms: rooms.map((r) => ({ children: "0", nightlyRate: "185000", ...r })),
    ...extra,
  });

  let mainId = "";
  let secondId = "";
  let depositReceiptId = "";

  await step("réservation de deux chambres : numéro, montants, acompte et reçu", async () => {
    const result = await createReservation(
      desk,
      stay(
        [
          { roomId: r101, adults: "2" },
          { roomId: r301, adults: "2", children: "1", nightlyRate: "350000" },
        ],
        0,
        3,
        { mealPlan: "PETIT_DEJEUNER", deposit: { amount: "500000", method: "CARTE", reference: "" } },
      ),
    );
    assert.ok(result.ok, !result.ok ? result.error : "");
    mainId = result.id;
    depositReceiptId = result.receiptId!;
    const folio = (await getFolio(mainId))!;
    assert.match(folio.reservation.number, /^RES-\d{4}-0001$/);
    // 3 x 185 000 + 3 x 350 000 = 1 605 000 ; formule 5 pers. x 3 nuits x 25 000 = 375 000
    assert.equal(folio.totals.accommodation, 1_605_000);
    assert.equal(folio.totals.meals, 375_000);
    assert.equal(folio.totals.vatAmount, 356_400);
    assert.equal(folio.totals.cityTaxAmount, 12_000); // 2 chambres x 3 nuits x 2 000
    assert.equal(folio.totals.total, 2_348_400);
    assert.equal(folio.balance, 1_848_400);
    const receipt = (await getReceipt(depositReceiptId))!;
    assert.match(receipt.number, /^REC-\d{4}-0001$/);
    assert.match(receipt.label, /^Acompte/);
    assert.equal(receipt.balanceAfter, 1_848_400);
  });

  await step("chambre déjà réservée : refus, sans consommer de numéro", async () => {
    expectError(await createReservation(desk, stay([{ roomId: r101, adults: "1" }], 1, 2)), /chambre 101 est déjà réservée/);
  });

  await step("chambre hors service, capacité et dates passées refusées", async () => {
    expectError(await createReservation(desk, stay([{ roomId: r106, adults: "1" }], 5, 6)), /hors service/);
    expectError(await createReservation(desk, stay([{ roomId: r102, adults: "3" }], 5, 6)), /capacité de 2/);
    expectError(await createReservation(desk, stay([{ roomId: r102, adults: "1" }], -2, 1)), /passé/);
  });

  await step("client déjà connu retrouvé par son e-mail, numérotation continue", async () => {
    const result = await createReservation(desk, stay([{ roomId: r102, adults: "1" }], 5, 6));
    assert.ok(result.ok);
    secondId = result.id;
    assert.equal(await db.guest.count(), 1, "pas de doublon de fiche client");
    assert.match((await getFolio(secondId))!.reservation.number, /-0002$/, "les refus n'ont pas consommé de numéro");
  });

  await step("check-in, prestation et addition du restaurant portées sur la note", async () => {
    assert.ok((await checkInReservation(desk, mainId)).ok);
    assert.ok((await addCharge(desk, mainId, { designation: "Soin au spa", quantity: "2", unitPrice: "45000", date: T })).ok);
    const order = await createOrder(desk, { tableLabel: "Table 1", covers: "2", reservationId: mainId, guestName: "", notes: "" });
    assert.ok(order.ok);
    await addOrderItem(desk, order.id, dish.id);
    await addOrderItem(desk, order.id, dish.id);
    assert.ok((await chargeOrderToRoom(desk, order.id, "")).ok);
    const folio = (await getFolio(mainId))!;
    assert.equal(folio.totals.extras, 90_000);
    assert.equal(folio.totals.restaurant, 76_000, "addition portée pour son montant HT");
    assert.equal(folio.totals.total, 2_146_000 + 386_280 + 12_000);
  });

  await step("départ refusé tant que le solde n'est pas réglé", async () => {
    expectError(await checkOutReservation(desk, mainId), /Reste à payer/);
  });

  await step("paiement supérieur au reste à payer refusé", async () => {
    const folio = (await getFolio(mainId))!;
    expectError(await recordPayment(desk, mainId, { amount: String(folio.balance + 1), method: "ESPECES" }), /dépasse le reste à payer/);
  });

  await step("encaissement du solde : reçu soldé, puis départ validé", async () => {
    const folio = (await getFolio(mainId))!;
    const result = await recordPayment(desk, mainId, { amount: String(folio.balance), method: "ESPECES", reference: "", payerName: "" });
    assert.ok(result.ok);
    const receipt = (await getReceipt(result.id))!;
    assert.equal(receipt.balanceAfter, 0);
    assert.match(receipt.label, /^Solde du séjour/);
    assert.equal(receipt.payerName, "Awa Test");
    assert.ok((await checkOutReservation(desk, mainId)).ok);
    assert.equal((await getFolio(mainId))!.reservation.status, "TERMINEE");
  });

  await step("annulation d'un reçu : réservée à la direction, le montant n'est plus compté", async () => {
    const paid = await recordPayment(desk, secondId, { amount: "100000", method: "MOBILE_MONEY" });
    assert.ok(paid.ok);
    expectError(await cancelReceipt(desk, paid.id, "Erreur"), /réservée à la direction/);
    assert.ok((await cancelReceipt(director, paid.id, "Erreur de saisie")).ok);
    assert.equal((await getFolio(secondId))!.paid, 0);
    expectError(await cancelReceipt(director, paid.id, "Encore"), /déjà annulé/);
  });

  let quoteId = "";
  await step("devis : totaux par catégorie, puis transformation en réservation", async () => {
    const created = await createQuote(desk, {
      guest: { mode: "existing", guestId: (await db.guest.findFirstOrThrow()).id },
      checkIn: d(10),
      checkOut: d(12),
      mealPlan: "CHAMBRE_SEULE",
      issueDate: T,
      validUntil: d(15),
      notes: "",
      rooms: [{ roomTypeId: deluxe.id, quantity: "2", adults: "2", children: "0", nightlyRate: "185000" }],
      extras: [{ designation: "Transfert aéroport", quantity: "2", unitPrice: "35000" }],
    });
    assert.ok(created.ok, !created.ok ? created.error : "");
    quoteId = created.id;
    const quote = (await getQuote(quoteId))!;
    assert.match(quote.number, /^DEV-\d{4}-0001$/);
    assert.equal(quote.subtotal, 810_000); // 2 ch. x 2 nuits x 185 000 + 70 000
    assert.equal(quote.total, 810_000 + 145_800 + 8_000);
    assert.equal(quoteLines(quote).reduce((s, l) => s + l.total, 0), quote.subtotal, "les lignes du document font le total HT");

    assert.ok((await changeQuoteStatus(desk, quoteId, "ENVOYE")).ok);
    const converted = await convertQuote(desk, quoteId);
    assert.ok(converted.ok, !converted.ok ? converted.error : "");
    const folio = (await getFolio(converted.id))!;
    assert.equal(folio.reservation.rooms.length, 2, "deux chambres Deluxe attribuées");
    assert.equal(folio.totals.total, quote.total, "la réservation reprend le devis à l'identique");
    assert.equal((await getQuote(quoteId))!.status, "ACCEPTE");
    expectError(await convertQuote(desk, quoteId), /déjà été transformé/);
  });

  await step("devis : transformation refusée s'il manque des chambres libres", async () => {
    const created = await createQuote(desk, {
      guest: { mode: "existing", guestId: (await db.guest.findFirstOrThrow()).id },
      checkIn: d(20),
      checkOut: d(21),
      mealPlan: "CHAMBRE_SEULE",
      issueDate: T,
      validUntil: d(15),
      notes: "",
      rooms: [{ roomTypeId: suite.id, quantity: "2", adults: "2", nightlyRate: "350000" }],
      extras: [],
    });
    assert.ok(created.ok);
    expectError(await convertQuote(desk, created.id), /Plus assez de chambres « Suite »/);
  });

  await step("annulation d'une réservation confirmée : la chambre redevient libre", async () => {
    assert.ok((await cancelReservation(desk, secondId, "Changement de programme")).ok);
    const again = await createReservation(desk, stay([{ roomId: r102, adults: "1" }], 5, 6));
    assert.ok(again.ok, !again.ok ? again.error : "");
  });

  await step("parcours en étapes : chambres → séjour → client, chaque étape validée", async () => {
    let draft = newBookingDraft(T);
    draft = mergeDraft(draft, { rooms: [{ roomId: r106, adults: "", children: "", nightlyRate: "" }] });
    expectError(await applyRoomsStep(draft), /hors service/);

    draft = mergeDraft(draft, { rooms: [{ roomId: r101, adults: "", children: "", nightlyRate: "" }] });
    const rooms = await applyRoomsStep(draft);
    assert.ok(rooms.ok, !rooms.ok ? rooms.error : "");
    draft = rooms.draft;
    assert.deepEqual([draft.rooms[0].adults, draft.rooms[0].nightlyRate], ["2", "185000"], "occupants et tarif par défaut");

    // La chambre 101 est prise du J+10 au J+12 (reservation issue du devis).
    draft = mergeDraft(draft, { checkIn: d(10), checkOut: d(11) });
    expectError(await applyStayStep(draft), /chambre 101 est déjà réservée/);

    draft = mergeDraft(draft, { checkIn: d(30), checkOut: d(32), mealPlan: "PETIT_DEJEUNER", checkInTime: "25:00" });
    expectError(await applyStayStep(draft), /Heure d'arrivée invalide/);

    draft = mergeDraft(draft, { checkInTime: "16:30", checkOutTime: "10:00" });
    const stayStep = await applyStayStep(draft);
    assert.ok(stayStep.ok, !stayStep.ok ? stayStep.error : "");
    draft = stayStep.draft;

    const withNewRoom = mergeDraft(draft, {
      rooms: [...draft.rooms, { roomId: r102, adults: "1", children: "0", nightlyRate: "185000" }],
    });
    assert.deepEqual(withNewRoom.done, { chambres: false, sejour: false }, "ajouter une chambre oblige à revalider");
    expectError(await confirmDraft(desk, withNewRoom), /Complétez d'abord/);

    draft = mergeDraft(draft, {
      guest: { mode: "existing", guestId: (await db.guest.findFirstOrThrow()).id },
      notes: "Arrivée tardive",
    });
    assert.deepEqual(draft.done, { chambres: true, sejour: true }, "le client et les notes ne remettent pas le séjour en cause");
    const created = await confirmDraft(desk, draft);
    assert.ok(created.ok, !created.ok ? created.error : "");
    const folio = (await getFolio(created.id))!;
    assert.equal(folio.reservation.rooms[0].room.number, "101");
    assert.equal(folio.nights, 2);
    assert.equal(folio.totals.meals, 2 * 2 * 25_000);
    assert.equal(folio.reservation.notes, "Arrivée tardive");
    assert.equal(folio.reservation.checkInTime, "16:30", "heure d'arrivée conservée");
    assert.equal(folio.reservation.checkOutTime, "10:00", "heure de départ conservée");
  });

  await step("addition encaissée directement, puis reçu annulé : l'addition est à nouveau à encaisser", async () => {
    const order = await createOrder(desk, { tableLabel: "Bar", covers: "1", reservationId: "", guestName: "Passage", notes: "" });
    assert.ok(order.ok);
    await addOrderItem(desk, order.id, dish.id);
    const paid = await payOrder(desk, order.id, { method: "CARTE", reference: "", payerName: "" });
    assert.ok(paid.ok);
    const receipt = (await getReceipt(paid.receiptId))!;
    assert.equal(receipt.amount, 44_840); // 38 000 + TVA 18 %
    assert.equal(receipt.reservationId, null, "hors note de séjour");
    assert.ok((await cancelReceipt(director, receipt.id, "Remboursé")).ok);
    assert.equal((await db.restaurantOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "OUVERTE");
  });

  await step("PDF : devis, note de séjour et reçu générés", async () => {
    const hotel = await db.hotel.findUniqueOrThrow({ where: { id: "main" } });
    const quote = (await getQuote(quoteId))!;
    const quotePdf = await generateQuotePdf({
      hotel,
      quote: { ...quote, nights: 2, mealPlanLabel: "Chambre seule", roomCount: 2, persons: 4 },
      guest: { name: "Awa Test", company: null, email: null, phone: null, address: null },
      lines: quoteLines(quote),
      author: { name: "Reception Test", jobTitle: null },
    });
    const folio = (await getFolio(mainId))!;
    const folioPdf = await generateFolioPdf({
      hotel,
      reservation: { ...folio.reservation, length: folio.length, mealPlanLabel: "Petit-déjeuner", roomsLabel: "Chambres 101, 301", persons: 5 },
      guest: { name: "Awa Test", company: null, email: null, phone: null, address: null },
      lines: folio.lines,
      totals: folio.totals,
      paid: folio.paid,
      balance: folio.balance,
      receipts: folio.reservation.receipts.map((x) => ({ ...x, cancelled: Boolean(x.cancelledAt) })),
      issuedAt: new Date(),
    });
    const receipt = (await getReceipt(depositReceiptId))!;
    const receiptPdf = await generateReceiptPdf({
      hotel,
      receipt: { ...receipt, cancelled: false },
      context: ["Séjour de test"],
      cashier: "Reception Test",
    });
    for (const bytes of [quotePdf, folioPdf]) assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
    const page = (await PDFDocument.load(receiptPdf)).getPage(0);
    assert.ok(page.getWidth() > page.getHeight(), "reçu au format A5 paysage");
  });

  console.log("\nTous les contrôles sont passés.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
