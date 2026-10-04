import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { paymentMethodLabel } from "./constants";
import type { DocumentLine } from "./folio";
import { formatDate, formatDateTime } from "./format";
import { currencySymbol, formatAmount, formatMoney, formatQuantity } from "./money";
import { amountInWords } from "./number-words";

/**
 * PDF des documents remis au client : devis (A4), note de sejour (A4) et recu (A5
 * paysage). Polices standard : Times pour le nom de l'hotel et les titres,
 * Helvetica pour le corps.
 */

export interface PdfHotel {
  name: string;
  tagline: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  tradeRegister: string | null;
  bankDetails: string | null;
}

export interface PdfGuest {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

const A4: [number, number] = [595.28, 841.89];
const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const FOOTER = 22; // reserve en bas de page pour le pied

const INK = rgb(0.11, 0.098, 0.09);
const MUTED = rgb(0.42, 0.388, 0.345);
const LINE = rgb(0.906, 0.882, 0.839);
const SOFT = rgb(0.984, 0.973, 0.957);
const GOLD = rgb(0.549, 0.365, 0.165);
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.75, 0.13, 0.13);

/** Caracteres hors WinAnsi (polices standard) : equivalents lisibles. */
const FALLBACK: Record<string, string> = {
  " ": " ",
  " ": " ",
  "\t": " ",
  "≥": ">=",
  "≤": "<=",
  "→": "->",
  "✓": "v",
  "★": "*",
};

interface TextOptions {
  size?: number;
  font?: PDFFont;
  color?: RGB;
  align?: "left" | "right" | "center";
  page?: PDFPage;
}

class Doc {
  page!: PDFPage;
  pages: PDFPage[] = [];
  y = 0;
  private readonly supported: Set<number>;

  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly serif: PDFFont,
    readonly size: [number, number],
    readonly margin: number,
    private readonly continuation?: (doc: Doc) => void,
  ) {
    this.supported = new Set([...regular.getCharacterSet(), ...bold.getCharacterSet()]);
  }

  get width() {
    return this.size[0] - this.margin * 2;
  }

  get left() {
    return this.margin;
  }

  get right() {
    return this.size[0] - this.margin;
  }

  safe(text: string) {
    let out = "";
    for (const ch of text.normalize("NFC")) {
      if (ch === "\n" || this.supported.has(ch.codePointAt(0)!)) out += ch;
      else out += FALLBACK[ch] ?? "";
    }
    return out;
  }

  addPage() {
    this.page = this.pdf.addPage(this.size);
    this.pages.push(this.page);
    this.y = this.size[1] - this.margin;
  }

  /** Passe a la page suivante si `height` ne tient plus ; renvoie vrai en cas de saut. */
  ensure(height: number) {
    if (this.y - height >= this.margin + FOOTER) return false;
    this.addPage();
    this.continuation?.(this);
    return true;
  }

  text(value: string, x: number, y: number, opts: TextOptions = {}) {
    const { size = 9, font = this.regular, color = INK, align = "left", page = this.page } = opts;
    const t = this.safe(value).replace(/\n/g, ", ");
    const w = font.widthOfTextAtSize(t, size);
    const dx = align === "right" ? -w : align === "center" ? -w / 2 : 0;
    page.drawText(t, { x: x + dx, y, size, font, color });
  }

  /** Decoupe un texte (paragraphes conserves) pour tenir dans `maxWidth`. */
  wrap(value: string, size: number, font: PDFFont, maxWidth: number) {
    const out: string[] = [];
    for (const paragraph of this.safe(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) out.push(line);
        let rest = word;
        while (rest.length > 1 && font.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      out.push(line);
    }
    return out;
  }

  /** Tronque sur une ligne. */
  fit(value: string, size: number, font: PDFFont, maxWidth: number) {
    let out = this.safe(value).replace(/\n/g, ", ");
    if (font.widthOfTextAtSize(out, size) <= maxWidth) return out;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
    return `${out}...`;
  }

  rule(y = this.y, color = LINE, thickness = 0.8) {
    this.page.drawLine({ start: { x: this.left, y }, end: { x: this.right, y }, thickness, color });
  }
}

async function createDoc(size: [number, number], margin: number, title: string, hotel: PdfHotel, continuation?: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor(hotel.name);
  pdf.setCreator("SuiteHotel");
  pdf.setProducer("SuiteHotel");
  const [regular, bold, serif] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.TimesRomanBold),
  ]);
  const doc = new Doc(pdf, regular, bold, serif, size, margin, (d) => {
    if (!continuation) return;
    d.text(`${hotel.name}  —  ${continuation} (suite)`, d.left, d.y - 8, { size: 8, color: MUTED });
    d.y -= 26;
  });
  doc.addPage();
  return { pdf, doc };
}

async function finish(pdf: PDFDocument): Promise<ArrayBuffer> {
  const bytes = await pdf.save();
  // Copie dans un ArrayBuffer simple : utilisable tel quel comme corps de Response.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function drawLabel(doc: Doc, label: string, x: number, y: number, color: RGB = MUTED) {
  doc.text(label.toUpperCase(), x, y, { size: 6.8, font: doc.bold, color });
}

function drawHeader(doc: Doc, hotel: PdfHotel, title: string, number: string, meta: string[], compact = false) {
  const top = doc.y;
  const leftW = doc.width * 0.58;

  let y = top - 18;
  for (const line of doc.wrap(hotel.name, 18, doc.serif, leftW)) {
    doc.text(line, doc.left, y, { size: 18, font: doc.serif });
    y -= 20;
  }
  if (hotel.tagline) {
    doc.text(doc.fit(hotel.tagline, 8.5, doc.regular, leftW), doc.left, y + 5, { size: 8.5, color: GOLD });
    y -= 12;
  }
  const place = [hotel.city, hotel.country].filter(Boolean).join(", ");
  const contact = [
    ...(compact || !hotel.address ? [] : hotel.address.split("\n")),
    place,
    [hotel.phone && `Tél. ${hotel.phone}`, hotel.email].filter(Boolean).join("  ·  "),
    compact ? "" : (hotel.website ?? ""),
  ].filter((l) => l.trim());
  y -= 2;
  for (const line of contact) {
    doc.text(doc.fit(line, 8.5, doc.regular, leftW), doc.left, y, { size: 8.5, color: MUTED });
    y -= 11.5;
  }

  doc.text(title, doc.right, top - 22, { size: 22, font: doc.serif, color: GOLD, align: "right" });
  doc.text(number, doc.right, top - 40, { size: 11, font: doc.bold, align: "right" });
  let my = top - 55;
  for (const m of meta) {
    doc.text(m, doc.right, my, { size: 8.5, color: MUTED, align: "right" });
    my -= 12;
  }

  doc.y = Math.min(y, my + 4) - 8;
  doc.rule(doc.y, GOLD, 1);
  doc.y -= 18;
}

interface Party {
  label: string;
  title: string;
  lines: string[];
}

function drawParties(doc: Doc, left: Party, right: Party) {
  const top = doc.y;
  const gap = 16;
  const colW = (doc.width - gap) / 2;
  const pad = 12;
  const inner = colW - pad * 2;

  const blocks = [left, right].map((party, i) => {
    const titles = doc.wrap(party.title, 11, doc.bold, inner);
    const lines = party.lines.filter((l) => l.trim()).flatMap((l) => doc.wrap(l, 8.5, doc.regular, inner));
    return { party, titles, lines, x: doc.left + i * (colW + gap), h: pad + 14 + titles.length * 14 + lines.length * 11.5 + pad - 4 };
  });
  const h = Math.max(...blocks.map((b) => b.h));

  for (const b of blocks) {
    doc.page.drawRectangle({ x: b.x, y: top - h, width: colW, height: h, color: SOFT, borderColor: LINE, borderWidth: 0.8 });
    let y = top - pad - 6;
    drawLabel(doc, b.party.label, b.x + pad, y, GOLD);
    y -= 16;
    for (const t of b.titles) {
      doc.text(t, b.x + pad, y, { size: 11, font: doc.bold });
      y -= 14;
    }
    for (const l of b.lines) {
      doc.text(l, b.x + pad, y, { size: 8.5, color: MUTED });
      y -= 11.5;
    }
  }
  doc.y = top - h - 22;
}

function guestLines(guest: PdfGuest) {
  return [
    guest.company ?? "",
    ...(guest.address ? guest.address.split("\n") : []),
    guest.phone ? `Tél. ${guest.phone}` : "",
    guest.email ?? "",
  ];
}

interface Column {
  key: "index" | "designation" | "qty" | "price" | "total";
  label: string;
  width: number;
  align: "left" | "right";
}

function columns(doc: Doc): Column[] {
  const fixed: Column[] = [
    { key: "qty", label: "Qté", width: 78, align: "right" },
    { key: "price", label: "P.U. HT", width: 78, align: "right" },
    { key: "total", label: "Montant HT", width: 86, align: "right" },
  ];
  const index: Column = { key: "index", label: "N°", width: 24, align: "left" };
  const used = index.width + fixed.reduce((sum, c) => sum + c.width, 0);
  return [index, { key: "designation", label: "Désignation", width: doc.width - used, align: "left" }, ...fixed];
}

function drawTableHeader(doc: Doc, cols: Column[]) {
  const h = 22;
  doc.page.drawRectangle({ x: doc.left, y: doc.y - h, width: doc.width, height: h, color: INK });
  let x = doc.left;
  for (const c of cols) {
    const tx = c.align === "right" ? x + c.width - 7 : x + 7;
    doc.text(c.label, tx, doc.y - 14.5, { size: 7.5, font: doc.bold, color: WHITE, align: c.align });
    x += c.width;
  }
  doc.y -= h;
}

function drawItemsTable(doc: Doc, lines: DocumentLine[], currency: string) {
  const cols = columns(doc);
  const designation = cols.find((c) => c.key === "designation")!;
  const innerW = designation.width - 14;

  doc.ensure(60);
  doc.text(`Montants en ${currencySymbol(currency)}`, doc.right, doc.y + 4, { size: 7, color: MUTED, align: "right" });
  doc.y -= 6;
  drawTableHeader(doc, cols);

  lines.forEach((line, i) => {
    const titleLines = doc.wrap(line.designation, 9, doc.bold, innerW);
    const detailLines = line.detail ? doc.wrap(line.detail, 8, doc.regular, innerW) : [];
    const rowH = 9 + titleLines.length * 11.5 + detailLines.length * 10 + 8;
    if (doc.ensure(rowH)) drawTableHeader(doc, cols);

    const top = doc.y;
    if (i % 2 === 1) doc.page.drawRectangle({ x: doc.left, y: top - rowH, width: doc.width, height: rowH, color: SOFT });

    const baseline = top - 16;
    let x = doc.left;
    for (const c of cols) {
      const right = x + c.width - 7;
      const maxW = c.width - 10;
      if (c.key === "index") {
        doc.text(String(i + 1), x + 7, baseline, { size: 8.5, color: MUTED });
      } else if (c.key === "designation") {
        let y = baseline;
        for (const t of titleLines) {
          doc.text(t, x + 7, y, { size: 9, font: doc.bold });
          y -= 11.5;
        }
        for (const d of detailLines) {
          doc.text(d, x + 7, y, { size: 8, color: MUTED });
          y -= 10;
        }
      } else if (c.key === "qty") {
        const qty = `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ""}`;
        doc.text(doc.fit(qty, 8.5, doc.regular, maxW), right, baseline, { size: 8.5, align: "right" });
      } else if (c.key === "price") {
        doc.text(doc.fit(formatAmount(line.unitPrice, currency), 8.5, doc.regular, maxW), right, baseline, {
          size: 8.5,
          align: "right",
        });
      } else {
        doc.text(doc.fit(formatAmount(line.total, currency), 9, doc.bold, maxW), right, baseline, {
          size: 9,
          font: doc.bold,
          align: "right",
        });
      }
      x += c.width;
    }
    doc.y = top - rowH;
    doc.rule(doc.y, LINE, 0.5);
  });
  doc.y -= 14;
}

/** Encadre des totaux, a droite : lignes de detail, total TTC (bandeau or), puis lignes de suivi. */
function drawTotals(doc: Doc, rows: [string, string][], final: [string, string], after: [string, string][] = []) {
  const boxW = 250;
  const x = doc.right - boxW;
  const rowH = 18;
  doc.ensure((rows.length + after.length) * rowH + 40);

  let y = doc.y;
  for (const [label, value] of rows) {
    doc.text(label, x + 10, y - 12.5, { size: 9, color: MUTED });
    doc.text(value, x + boxW - 10, y - 12.5, { size: 9, align: "right" });
    y -= rowH;
    doc.page.drawLine({ start: { x, y }, end: { x: x + boxW, y }, thickness: 0.5, color: LINE });
  }
  doc.page.drawRectangle({ x, y: y - 26, width: boxW, height: 26, color: GOLD });
  doc.text(final[0], x + 10, y - 17, { size: 10, font: doc.bold, color: WHITE });
  doc.text(final[1], x + boxW - 10, y - 17, { size: 11, font: doc.bold, color: WHITE, align: "right" });
  y -= 26;
  for (const [label, value] of after) {
    doc.text(label, x + 10, y - 13, { size: 9, font: doc.bold });
    doc.text(value, x + boxW - 10, y - 13, { size: 9.5, font: doc.bold, align: "right" });
    y -= rowH;
    doc.page.drawLine({ start: { x, y }, end: { x: x + boxW, y }, thickness: 0.5, color: LINE });
  }
  doc.y = y - 20;
}

function drawWords(doc: Doc, intro: string, amount: number, currency: string, suffix = "") {
  const words = doc.wrap(`${amountInWords(amount, currency)}${suffix}.`, 9.5, doc.bold, doc.width);
  doc.ensure(16 + words.length * 12);
  doc.text(intro, doc.left, doc.y, { size: 9, color: MUTED });
  doc.y -= 13;
  for (const line of words) {
    doc.text(line, doc.left, doc.y, { size: 9.5, font: doc.bold });
    doc.y -= 12;
  }
  doc.y -= 12;
}

function drawParagraph(doc: Doc, label: string, value: string) {
  const lines = doc.wrap(value, 8.5, doc.regular, doc.width);
  doc.ensure(28);
  drawLabel(doc, label, doc.left, doc.y);
  doc.y -= 13;
  for (const line of lines) {
    doc.ensure(11);
    doc.text(line, doc.left, doc.y, { size: 8.5 });
    doc.y -= 11;
  }
  doc.y -= 12;
}

function drawSignatures(doc: Doc, boxes: [string, string][], h = 74) {
  doc.ensure(h + 8);
  const gap = 20;
  const boxW = (doc.width - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach(([title, hint], i) => {
    const x = doc.left + i * (boxW + gap);
    doc.page.drawRectangle({ x, y: doc.y - h, width: boxW, height: h, borderColor: LINE, borderWidth: 0.8 });
    doc.text(doc.fit(title, 8.5, doc.bold, boxW - 20), x + 10, doc.y - 16, { size: 8.5, font: doc.bold });
    let y = doc.y - 28;
    for (const line of doc.wrap(hint, 7.5, doc.regular, boxW - 20)) {
      doc.text(line, x + 10, y, { size: 7.5, color: MUTED });
      y -= 9.5;
    }
  });
  doc.y -= h + 10;
}

function drawFooters(doc: Doc, hotel: PdfHotel) {
  const legal = [
    hotel.name,
    hotel.tradeRegister && `RCCM ${hotel.tradeRegister}`,
    hotel.taxId && `N° CC ${hotel.taxId}`,
    hotel.phone,
    hotel.email,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const total = doc.pages.length;
  const base = doc.margin - 16;
  doc.pages.forEach((page, i) => {
    page.drawLine({
      start: { x: doc.left, y: base + 12 },
      end: { x: doc.right, y: base + 12 },
      thickness: 0.5,
      color: LINE,
    });
    doc.text(doc.fit(legal, 7, doc.regular, doc.width - 70), doc.left, base, { size: 7, color: MUTED, page });
    if (total > 1) doc.text(`Page ${i + 1} / ${total}`, doc.right, base, { size: 7, color: MUTED, align: "right", page });
  });
}

// ----- Devis -----

export interface QuotePdfData {
  hotel: PdfHotel & { checkInTime: string; checkOutTime: string };
  quote: {
    number: string;
    issueDate: Date;
    validUntil: Date;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    mealPlanLabel: string;
    roomCount: number;
    persons: number;
    currency: string;
    vatRate: number;
    notes: string | null;
    subtotal: number;
    vatAmount: number;
    cityTaxAmount: number;
    total: number;
  };
  guest: PdfGuest;
  lines: DocumentLine[];
  author: { name: string; jobTitle: string | null };
}

export async function generateQuotePdf(data: QuotePdfData): Promise<ArrayBuffer> {
  const { hotel, quote } = data;
  const cur = quote.currency;
  const { pdf, doc } = await createDoc(A4, 42, `Devis ${quote.number}`, hotel, `Devis ${quote.number}`);

  drawHeader(doc, hotel, "DEVIS", quote.number, [
    `Émis le ${formatDate(quote.issueDate)}`,
    `Valable jusqu'au ${formatDate(quote.validUntil)}`,
  ]);
  drawParties(
    doc,
    {
      label: "Votre séjour",
      title: `${quote.nights} nuit${quote.nights > 1 ? "s" : ""} · ${quote.mealPlanLabel}`,
      lines: [
        `Arrivée : ${formatDate(quote.checkIn, { weekday: "long" })}, à partir de ${hotel.checkInTime}`,
        `Départ : ${formatDate(quote.checkOut, { weekday: "long" })}, avant ${hotel.checkOutTime}`,
        `${quote.roomCount} chambre${quote.roomCount > 1 ? "s" : ""} · ${quote.persons} personne${quote.persons > 1 ? "s" : ""}`,
        `Votre interlocuteur : ${data.author.jobTitle ? `${data.author.name}, ${data.author.jobTitle}` : data.author.name}`,
      ],
    },
    { label: "Client", title: data.guest.name, lines: guestLines(data.guest) },
  );
  drawItemsTable(doc, data.lines, cur);
  drawTotals(
    doc,
    [
      ["Total HT", formatAmount(quote.subtotal, cur)],
      [`TVA (${formatQuantity(quote.vatRate)} %)`, formatAmount(quote.vatAmount, cur)],
      ...(quote.cityTaxAmount > 0 ? [["Taxe de séjour", formatAmount(quote.cityTaxAmount, cur)] as [string, string]] : []),
    ],
    ["Total TTC", formatMoney(quote.total, cur)],
  );
  drawWords(doc, "Arrêté le présent devis à la somme de :", quote.total, cur, " TTC");
  if (quote.notes) drawParagraph(doc, "Conditions", quote.notes);
  if (hotel.bankDetails) drawParagraph(doc, "Coordonnées bancaires", hotel.bankDetails);
  drawSignatures(doc, [
    [`Pour ${hotel.name}`, "Date et signature"],
    ["Bon pour accord — Le client", "Date et signature, précédées de la mention « Bon pour accord »"],
  ]);
  drawFooters(doc, hotel);
  return finish(pdf);
}

// ----- Note de sejour -----

export interface FolioPdfData {
  hotel: PdfHotel & { checkInTime: string; checkOutTime: string };
  reservation: {
    number: string;
    checkIn: Date;
    checkInTime: string;
    checkOut: Date;
    checkOutTime: string;
    /** Duree lisible : « 3 nuits », « 4 h »… */
    length: string;
    mealPlanLabel: string;
    roomsLabel: string;
    persons: number;
    currency: string;
    vatRate: number;
  };
  guest: PdfGuest;
  lines: DocumentLine[];
  totals: { subtotal: number; vatAmount: number; cityTaxAmount: number; total: number };
  paid: number;
  balance: number;
  receipts: { number: string; paidAt: Date; method: string; amount: number; cancelled: boolean }[];
  issuedAt: Date;
}

export async function generateFolioPdf(data: FolioPdfData): Promise<ArrayBuffer> {
  const { hotel, reservation: r, totals } = data;
  const cur = r.currency;
  const { pdf, doc } = await createDoc(A4, 42, `Note de séjour ${r.number}`, hotel, `Note de séjour ${r.number}`);

  drawHeader(doc, hotel, "NOTE DE SÉJOUR", r.number, [`Éditée le ${formatDateTime(data.issuedAt)}`]);
  drawParties(
    doc,
    {
      label: "Séjour",
      title: `${r.length} · ${r.mealPlanLabel}`,
      lines: [
        `Du ${formatDate(r.checkIn, { weekday: "long" })} à ${r.checkInTime}`,
        `au ${formatDate(r.checkOut, { weekday: "long" })} à ${r.checkOutTime}`,
        `${r.roomsLabel} · ${r.persons} personne${r.persons > 1 ? "s" : ""}`,
      ],
    },
    { label: "Client", title: data.guest.name, lines: guestLines(data.guest) },
  );
  drawItemsTable(doc, data.lines, cur);
  drawTotals(
    doc,
    [
      ["Total HT", formatAmount(totals.subtotal, cur)],
      [`TVA (${formatQuantity(r.vatRate)} %)`, formatAmount(totals.vatAmount, cur)],
      ...(totals.cityTaxAmount > 0 ? [["Taxe de séjour", formatAmount(totals.cityTaxAmount, cur)] as [string, string]] : []),
    ],
    ["Total TTC", formatMoney(totals.total, cur)],
    [
      ["Déjà réglé", formatMoney(data.paid, cur)],
      [data.balance > 0 ? "Reste à payer" : data.balance < 0 ? "Trop-perçu" : "Solde", formatMoney(Math.abs(data.balance), cur)],
    ],
  );
  drawWords(doc, "Arrêtée la présente note à la somme de :", totals.total, cur, " TTC");

  const receipts = data.receipts.filter((x) => !x.cancelled);
  if (receipts.length) {
    doc.ensure(30 + receipts.length * 14);
    drawLabel(doc, "Règlements reçus", doc.left, doc.y);
    doc.y -= 14;
    for (const x of receipts) {
      doc.text(`${x.number}  ·  ${formatDateTime(x.paidAt)}  ·  ${paymentMethodLabel(x.method)}`, doc.left, doc.y, {
        size: 8.5,
        color: MUTED,
      });
      doc.text(formatMoney(x.amount, cur), doc.right, doc.y, { size: 8.5, align: "right" });
      doc.y -= 13;
    }
    doc.y -= 8;
  }
  if (hotel.bankDetails && data.balance > 0) drawParagraph(doc, "Coordonnées bancaires", hotel.bankDetails);
  doc.ensure(20);
  doc.text("Nous vous remercions de votre séjour et espérons avoir le plaisir de vous accueillir à nouveau.", doc.left, doc.y, {
    size: 8.5,
    color: GOLD,
  });
  drawFooters(doc, hotel);
  return finish(pdf);
}

// ----- Recu -----

export interface ReceiptPdfData {
  hotel: PdfHotel;
  receipt: {
    number: string;
    paidAt: Date;
    payerName: string;
    label: string;
    amount: number;
    currency: string;
    method: string;
    reference: string | null;
    balanceAfter: number | null;
    cancelled: boolean;
    cancelReason: string | null;
  };
  /** Precisions sous l'objet : sejour, chambres, addition… */
  context: string[];
  cashier: string;
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<ArrayBuffer> {
  const { hotel, receipt: r } = data;
  const cur = r.currency;
  const { pdf, doc } = await createDoc(A5_LANDSCAPE, 32, `Reçu ${r.number}`, hotel);

  drawHeader(doc, hotel, "REÇU", r.number, [`Le ${formatDateTime(r.paidAt)}`], true);

  const boxW = 176;
  const gap = 18;
  const leftW = doc.width - boxW - gap;
  const top = doc.y;

  // Montant, dans l'encadre or a droite.
  const boxX = doc.right - boxW;
  const boxH = 66;
  doc.page.drawRectangle({ x: boxX, y: top - boxH, width: boxW, height: boxH, color: GOLD });
  doc.text("MONTANT REÇU", boxX + 12, top - 17, { size: 7, font: doc.bold, color: WHITE });
  doc.text(doc.fit(formatMoney(r.amount, cur), 16, doc.bold, boxW - 24), boxX + boxW - 12, top - 41, {
    size: 16,
    font: doc.bold,
    color: WHITE,
    align: "right",
  });
  const method = `${paymentMethodLabel(r.method)}${r.reference ? ` · ${r.reference}` : ""}`;
  doc.text(doc.fit(method, 8, doc.regular, boxW - 24), boxX + 12, top - 57, { size: 8, color: WHITE });

  let y = top - 4;
  const row = (label: string, value: string, size: number, font: PDFFont, extra: string[] = []) => {
    drawLabel(doc, label, doc.left, y);
    y -= 13;
    for (const line of doc.wrap(value, size, font, leftW)) {
      doc.text(line, doc.left, y, { size, font });
      y -= size + 3;
    }
    for (const line of extra.flatMap((e) => doc.wrap(e, 8, doc.regular, leftW))) {
      doc.text(line, doc.left, y, { size: 8, color: MUTED });
      y -= 11;
    }
    y -= 7;
  };
  row("Reçu de", r.payerName, 11, doc.bold);
  row("La somme de", `${amountInWords(r.amount, cur)}.`, 9.5, doc.bold);
  row("Objet", r.label, 9.5, doc.regular, data.context);
  doc.y = Math.min(y, top - boxH - 12);

  if (r.balanceAfter !== null) {
    const text =
      r.balanceAfter > 0
        ? `Reste à payer sur le séjour après ce règlement : ${formatMoney(r.balanceAfter, cur)}`
        : "Séjour entièrement réglé à la date de ce reçu.";
    doc.text(text, doc.left, doc.y, { size: 8.5, font: doc.bold, color: r.balanceAfter > 0 ? INK : GOLD });
    doc.y -= 18;
  }

  drawSignatures(
    doc,
    [
      ["Le client", "Signature"],
      [`Pour ${hotel.name}`, `Encaissé par ${data.cashier}`],
    ],
    52,
  );
  drawFooters(doc, hotel);

  if (r.cancelled) {
    const page = doc.pages[0];
    page.drawText(doc.safe("ANNULÉ"), {
      x: doc.size[0] / 2 - 170,
      y: doc.size[1] / 2 - 60,
      size: 96,
      font: doc.bold,
      color: RED,
      rotate: degrees(18),
      opacity: 0.16,
    });
    doc.text(doc.fit(`Reçu annulé${r.cancelReason ? ` — ${r.cancelReason}` : ""}`, 8.5, doc.bold, doc.width), doc.left, doc.size[1] - 18, {
      size: 8.5,
      font: doc.bold,
      color: RED,
      page,
    });
  }
  return finish(pdf);
}
