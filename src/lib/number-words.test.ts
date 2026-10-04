import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, numberToWords } from "./number-words";

test("nombres en lettres (orthographe traditionnelle)", () => {
  const cases: [number, string][] = [
    [0, "zéro"],
    [1, "un"],
    [16, "seize"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [70, "soixante-dix"],
    [71, "soixante et onze"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [99, "quatre-vingt-dix-neuf"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [21000, "vingt et un mille"],
    [80000, "quatre-vingt mille"],
    [200000, "deux cent mille"],
    [1000000, "un million"],
    [1450000, "un million quatre cent cinquante mille"],
    [200000000, "deux cents millions"],
    [2000000000, "deux milliards"],
  ];
  for (const [n, expected] of cases) {
    assert.equal(numberToWords(n), expected, `${n}`);
  }
});

test("montants en lettres avec devise", () => {
  assert.equal(amountInWords(1200000, "XOF"), "Un million deux cent mille francs CFA");
  assert.equal(amountInWords(1000000, "XOF"), "Un million de francs CFA");
  assert.equal(amountInWords(100000000, "EUR"), "Un million d'euros");
  assert.equal(amountInWords(1, "XOF"), "Un franc CFA");
  assert.equal(amountInWords(123050, "EUR"), "Mille deux cent trente euros et cinquante centimes");
});
