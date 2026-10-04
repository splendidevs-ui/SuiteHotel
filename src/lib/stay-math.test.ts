import { test } from "node:test";
import assert from "node:assert/strict";
import { addHoursToTime, nightsBetween, orderTotals, stayHours, stayLength, staysOverlap, stayTotals } from "./stay-math";

test("nuits entre deux dates calendaires", () => {
  assert.equal(nightsBetween("2026-09-12", "2026-09-15"), 3);
  assert.equal(nightsBetween("2026-09-29", "2026-10-02"), 3, "a cheval sur deux mois");
  assert.equal(nightsBetween("2026-12-31", "2027-01-01"), 1, "a cheval sur deux annees");
  assert.equal(nightsBetween("2026-09-15", "2026-09-15"), 1, "sejour de jour facture une nuit");
  assert.equal(nightsBetween("2026-09-15", "2026-09-12"), 0, "jamais negatif");
  assert.equal(nightsBetween("2026-02-30", "2026-03-02"), 0, "date inexistante");
});

test("sejour de jour : depart le jour de l'arrivee", () => {
  assert.equal(stayLength("2026-09-15", "2026-09-15"), "Journée");
  assert.equal(stayLength("2026-09-15", "2026-09-17"), "2 nuits");
  const day = { checkIn: "2026-09-15", checkOut: "2026-09-15" };
  assert.equal(staysOverlap(day, day), true, "deux sejours de jour le meme jour");
  assert.equal(staysOverlap(day, { checkIn: "2026-09-14", checkOut: "2026-09-15" }), false, "apres le depart du client precedent");
  assert.equal(staysOverlap(day, { checkIn: "2026-09-15", checkOut: "2026-09-16" }), true, "arrivee pour la nuit le meme jour");
  assert.equal(staysOverlap(day, { checkIn: "2026-09-16", checkOut: "2026-09-18" }), false);
  assert.equal(staysOverlap(day, { checkIn: "2026-09-10", checkOut: "2026-09-20" }), true);
});

test("sejour a l'heure : heures entamees, hebergement au tarif horaire", () => {
  assert.equal(stayHours("2026-09-15", "2026-09-15", "10:00", "13:00"), 3);
  assert.equal(stayHours("2026-09-15", "2026-09-15", "10:00", "13:20"), 4, "heure entamee");
  assert.equal(stayHours("2026-09-15", "2026-09-16", "14:00", "12:00"), null, "nuit : pas a l'heure");
  assert.equal(stayLength("2026-09-15", "2026-09-15", "10:00", "13:00"), "3 h");
  assert.equal(addHoursToTime("14:00", 1), "15:00");
  assert.equal(addHoursToTime("23:30", 1), "23:59", "jamais apres minuit");
  const t = stayTotals({
    nights: 1,
    hours: 3,
    rooms: [{ adults: 2, children: 0, nightlyRate: 10_000 }],
    mealPlanPrice: 0,
    vatRate: 0,
    cityTax: 2_000,
  });
  assert.equal(t.accommodation, 30_000);
  assert.equal(t.cityTaxAmount, 2_000);
});

test("sejour de deux chambres : hebergement, formule, TVA, taxe de sejour", () => {
  const t = stayTotals({
    nights: 3,
    rooms: [
      { adults: 2, children: 0, nightlyRate: 350_000 },
      { adults: 1, children: 1, nightlyRate: 185_000 },
    ],
    mealPlanPrice: 25_000,
    extras: 40_000,
    vatRate: 18,
    cityTax: 2_000,
  });
  assert.equal(t.roomCount, 2);
  assert.equal(t.persons, 4);
  assert.equal(t.accommodation, 1_605_000); // 3 x 350 000 + 3 x 185 000
  assert.equal(t.meals, 300_000); // 4 personnes x 3 nuits x 25 000
  assert.equal(t.subtotal, 1_945_000);
  assert.equal(t.vatAmount, 350_100);
  assert.equal(t.cityTaxAmount, 12_000); // 2 chambres x 3 nuits x 2 000, hors TVA
  assert.equal(t.total, 2_307_100);
});

test("devis : plusieurs chambres identiques sur une meme ligne", () => {
  const t = stayTotals({
    nights: 2,
    rooms: [{ quantity: 2, adults: 2, children: 1, nightlyRate: 100_000 }],
    mealPlanPrice: 10_000,
    vatRate: 18,
    cityTax: 1_000,
  });
  assert.equal(t.roomCount, 2);
  assert.equal(t.persons, 6);
  assert.equal(t.accommodation, 400_000);
  assert.equal(t.meals, 120_000);
  assert.equal(t.cityTaxAmount, 4_000);
  assert.equal(t.total, 520_000 + 93_600 + 4_000);
});

test("addition du restaurant", () => {
  const t = orderTotals(
    [
      { quantity: 2, unitPrice: 38_000 },
      { quantity: 1, unitPrice: 95_000 },
    ],
    18,
  );
  assert.deepEqual(t, { subtotal: 171_000, vatAmount: 30_780, total: 201_780 });
});
