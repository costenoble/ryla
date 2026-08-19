import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { computeVisibility } from "./branching";
import { sha256Hex } from "./crypto";
import { formatAnswer, formatDuration, formatTimestamp } from "./format";
import { NON_ANSWERABLE_TYPES, type Answers, type FormDefinition } from "./form-schema";
import type { ProofBundle } from "./proof";
import type { LetterheadBlock } from "./letterhead";

/**
 * Génération du document signé.
 *
 * Le PDF n'est pas un rendu de confort : c'est la pièce qu'on produira en cas
 * de litige. Il contient le texte intégral affiché au patient, ses réponses,
 * les déclarations cochées — et en annexe le dossier de preuve, avec les
 * empreintes et les horodatages qui permettent de démontrer que rien n'a été
 * modifié depuis.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const LINE = 13;

type Layout = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  brand: ReturnType<typeof rgb>;
};

/**
 * Caractères de WinAnsi situés au-delà de Latin-1.
 *
 * Les polices PDF standard encodent en WinAnsi, dont le répertoire dépasse
 * Latin-1 : Œ, œ, €, les guillemets courbes et les tirets cadratins en font
 * partie. Les filtrer sur \x00-\xFF transformerait « Œdème de Quincke » en
 * « ?dème de Quincke » — dans un document médical, c'est inacceptable.
 */
const WINANSI_EXTRA =
  "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039" +
  "\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122" +
  "\u0161\u203A\u0153\u017E\u0178";

/** Espaces typographiques absentes de WinAnsi. */
const NARROW_SPACES = "\u2009\u200A\u202F\u2060";

/**
 * Rend un texte encodable par les polices PDF standard.
 *
 * Ce qui existe en WinAnsi est conservé tel quel ; le reste est replié sur un
 * équivalent lisible. Un caractère non encodable ferait échouer `drawText` au
 * milieu de la génération d'un consentement — mieux vaut un repli visible
 * qu'une signature qui n'aboutit pas.
 */
export function sanitizeForPdf(text: string): string {
  let output = "";
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0x3f;
    if (code <= 0xff || WINANSI_EXTRA.includes(char)) {
      output += char;
    } else if (NARROW_SPACES.includes(char)) {
      output += " ";
    } else if (code >= 0x2010 && code <= 0x2015) {
      output += "-";
    } else {
      output += "?";
    }
  }
  return output;
}

const sanitize = sanitizeForPdf;

function hexToRgb(hex: string | undefined) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!match?.[1]) return rgb(0.06, 0.32, 0.34);
  const value = parseInt(match[1], 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function newPage(layout: Layout): void {
  layout.page = layout.doc.addPage([A4.width, A4.height]);
  layout.y = A4.height - MARGIN;
}

function ensureSpace(layout: Layout, needed: number): void {
  if (layout.y - needed < MARGIN + 40) newPage(layout);
}

function write(
  layout: Layout,
  text: string,
  options: {
    font?: PDFFont;
    size?: number;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    gap?: number;
  } = {},
): void {
  const font = options.font ?? layout.regular;
  const size = options.size ?? 9.5;
  const indent = options.indent ?? 0;
  const maxWidth = A4.width - MARGIN * 2 - indent;

  for (const line of wrap(text, font, size, maxWidth)) {
    ensureSpace(layout, LINE);
    if (line) {
      layout.page.drawText(line, {
        x: MARGIN + indent,
        y: layout.y,
        size,
        font,
        color: options.color ?? rgb(0.1, 0.12, 0.15),
      });
    }
    layout.y -= LINE;
  }
  layout.y -= options.gap ?? 0;
}

/** Correspondance des trois tailles de l'éditeur d'en-tête. */
const LETTERHEAD_SIZES = { title: 14, normal: 9.5, small: 7.5 } as const;

/**
 * Écrit une ligne d'en-tête avec son alignement.
 *
 * `write()` ne sait qu'aligner à gauche : centrer demande la largeur réelle du
 * texte, donc la police et la taille. Les trois alignements et les trois
 * tailles sont exactement ce que l'éditeur des réglages propose — l'aperçu et
 * le PDF ne peuvent donc pas diverger.
 */
function writeAligned(layout: Layout, block: LetterheadBlock): void {
  const size = LETTERHEAD_SIZES[block.size ?? "normal"];
  const font = block.bold ? layout.bold : layout.regular;
  const maxWidth = A4.width - MARGIN * 2;
  const lineHeight = size * 1.35;

  for (const line of wrap(block.text, font, size, maxWidth)) {
    ensureSpace(layout, lineHeight);
    if (line) {
      const width = font.widthOfTextAtSize(line, size);
      const x =
        block.align === "center"
          ? MARGIN + (maxWidth - width) / 2
          : block.align === "right"
            ? A4.width - MARGIN - width
            : MARGIN;

      layout.page.drawText(line, {
        x,
        y: layout.y,
        size,
        font,
        color: block.size === "title" ? layout.brand : rgb(0.25, 0.28, 0.33),
      });
    }
    layout.y -= lineHeight;
  }
}

function rule(layout: Layout, color = rgb(0.85, 0.87, 0.9)): void {
  ensureSpace(layout, 10);
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y + 4 },
    end: { x: A4.width - MARGIN, y: layout.y + 4 },
    thickness: 0.6,
    color,
  });
  layout.y -= 10;
}

function heading(layout: Layout, text: string): void {
  ensureSpace(layout, 34);
  layout.y -= 8;
  write(layout, text, { font: layout.bold, size: 11.5, color: layout.brand });
  rule(layout, layout.brand);
}

// ---------------------------------------------------------------------------

export type RenderParams = {
  definition: FormDefinition;
  answers: Answers;
  tenant: {
    name: string;
    legalNotice?: string | null;
    address?: string | null;
    brandColor?: string | null;
    /** En-tête composé dans les réglages. À défaut, nom et adresse suffisent. */
    letterhead?: LetterheadBlock[] | null;
  };
  patient: {
    displayName: string;
    birthDate?: string | null;
  };
  practitioner?: {
    name: string;
    identifier?: string | null;
  } | null;
  signature?: {
    signerName: string;
    signerRole: string;
    signedAt: Date;
    statements: { text: string; acceptedAt: string }[];
    /** PNG du tracé manuscrit, si le patient en a fait un. */
    imagePng?: Uint8Array | null;
  } | null;
  proof?: ProofBundle | null;
  /**
   * Document produit hors de Ryla (devis du logiciel métier) à placer en tête.
   *
   * Ses pages sont recopiées telles quelles, sans pied de page ni surcharge :
   * c'est la pièce du cabinet, elle doit rester identique à l'octet près à ce
   * que le patient a lu. Ryla n'ajoute que ce qui suit.
   */
  attachment?: Uint8Array | null;
};

export async function renderSubmissionPdf(
  params: RenderParams,
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const doc = await PDFDocument.create();
  doc.setTitle(sanitize(params.definition.title));
  doc.setProducer("Ryla");
  doc.setCreator("Ryla");
  doc.setCreationDate(new Date());

  // La pièce importée passe en premier : le patient qui rouvre le document
  // signé doit tomber sur son devis, pas sur une page de garde Ryla.
  let attachedPages = 0;
  if (params.attachment) {
    try {
      const source = await PDFDocument.load(params.attachment, {
        // Un devis exporté par un logiciel métier est parfois protégé contre
        // la copie. On l'ignore : on ne le modifie pas, on l'annexe.
        ignoreEncryption: true,
      });
      const copied = await doc.copyPages(source, source.getPageIndices());
      for (const page of copied) doc.addPage(page);
      attachedPages = copied.length;
    } catch {
      // Un PDF illisible ne doit pas empêcher la signature d'aboutir : le
      // faisceau de preuves scelle de toute façon l'empreinte de la pièce
      // d'origine, qui reste consultable séparément.
      attachedPages = 0;
    }
  }

  const layout: Layout = {
    doc,
    page: doc.addPage([A4.width, A4.height]),
    y: A4.height - MARGIN,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    brand: hexToRgb(params.tenant.brandColor ?? undefined),
  };

  // --- En-tête -------------------------------------------------------------
  // L'en-tête composé dans les réglages prime : c'est ce que le praticien a
  // relu dans l'aperçu, et le document imprimé doit lui ressembler.
  if (params.tenant.letterhead?.length) {
    for (const block of params.tenant.letterhead) {
      writeAligned(layout, block);
    }
    layout.y -= 4;
  } else {
    write(layout, params.tenant.name, { font: layout.bold, size: 13, color: layout.brand });
    if (params.tenant.address) {
      write(layout, params.tenant.address, { size: 8, color: rgb(0.42, 0.45, 0.5) });
    }
  }
  layout.y -= 6;
  write(layout, params.definition.title, { font: layout.bold, size: 15 });
  layout.y -= 2;

  const identity = [
    `Patient : ${params.patient.displayName}`,
    params.patient.birthDate ? `né(e) le ${params.patient.birthDate}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  write(layout, identity, { size: 9.5, color: rgb(0.28, 0.32, 0.38) });

  if (params.practitioner) {
    write(
      layout,
      `Praticien : ${params.practitioner.name}` +
        (params.practitioner.identifier ? ` (RPPS ${params.practitioner.identifier})` : ""),
      { size: 9.5, color: rgb(0.28, 0.32, 0.38) },
    );
  }
  rule(layout, layout.brand);

  if (params.definition.intro) {
    write(layout, params.definition.intro, {
      font: layout.italic,
      size: 9,
      color: rgb(0.35, 0.38, 0.44),
      gap: 6,
    });
  }

  // --- Contenu -------------------------------------------------------------
  // On rejoue la visibilité : le document reproduit exactement ce que le
  // patient a vu, ni plus (pas de question masquée) ni moins.
  const { sections } = computeVisibility(params.definition, params.answers);

  for (const { section, fields } of sections) {
    heading(layout, section.title);
    if (section.description) {
      write(layout, section.description, {
        font: layout.italic,
        size: 8.5,
        color: rgb(0.4, 0.43, 0.48),
        gap: 4,
      });
    }

    for (const field of fields) {
      if (field.type === "info") {
        write(layout, field.label, { font: layout.bold, size: 9.5 });
        write(layout, field.body, { size: 9, indent: 10, gap: 4 });
        continue;
      }

      if (field.type === "consent" || field.type === "photo_consent") {
        const checked = params.answers[field.id] === true;
        write(layout, `${checked ? "[X]" : "[ ]"} ${field.statement}`, {
          size: 9,
          font: checked ? layout.regular : layout.italic,
          color: checked ? rgb(0.1, 0.12, 0.15) : rgb(0.5, 0.52, 0.56),
          gap: 3,
        });
        continue;
      }

      if (NON_ANSWERABLE_TYPES.has(field.type)) continue;

      write(layout, field.label, { font: layout.bold, size: 9 });
      write(layout, formatAnswer(field, params.answers[field.id]), {
        size: 9.5,
        indent: 10,
        gap: 3,
      });
    }
  }

  // --- Signature -----------------------------------------------------------
  if (params.signature) {
    heading(layout, "Signature");

    for (const statement of params.signature.statements) {
      write(layout, `[X] ${statement.text}`, { size: 9, gap: 2 });
      write(layout, `Coché le ${formatTimestamp(statement.acceptedAt)}`, {
        size: 7.5,
        indent: 14,
        color: rgb(0.45, 0.48, 0.53),
        gap: 4,
      });
    }

    layout.y -= 6;
    ensureSpace(layout, 90);
    write(layout, `Signé par : ${params.signature.signerName}`, {
      font: layout.bold,
      size: 10,
    });
    write(
      layout,
      `Le ${formatTimestamp(params.signature.signedAt.toISOString())} (heure de Paris)`,
      { size: 9, color: rgb(0.3, 0.33, 0.38) },
    );

    if (params.signature.imagePng) {
      try {
        const image = await doc.embedPng(params.signature.imagePng);
        const scaled = image.scaleToFit(180, 70);
        ensureSpace(layout, scaled.height + 10);
        layout.page.drawImage(image, {
          x: MARGIN,
          y: layout.y - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
        layout.y -= scaled.height + 10;
      } catch {
        // Un tracé illisible ne doit pas empêcher la production du document :
        // la valeur probante repose sur le faisceau, pas sur l'image.
      }
    }
  }

  // --- Mentions ------------------------------------------------------------
  if (params.definition.legalNotice || params.tenant.legalNotice) {
    layout.y -= 8;
    rule(layout);
    for (const notice of [params.definition.legalNotice, params.tenant.legalNotice]) {
      if (notice) {
        write(layout, notice, { size: 7.5, color: rgb(0.45, 0.48, 0.53), gap: 3 });
      }
    }
  }

  // --- Annexe : dossier de preuve -----------------------------------------
  if (params.proof) {
    newPage(layout);
    write(layout, "Annexe — dossier de preuve", {
      font: layout.bold,
      size: 14,
      color: layout.brand,
    });
    rule(layout, layout.brand);
    write(
      layout,
      "Cette annexe rassemble les éléments techniques permettant de vérifier " +
        "l'intégrité du document et les conditions dans lesquelles il a été " +
        "complété et signé.",
      { font: layout.italic, size: 8.5, color: rgb(0.4, 0.43, 0.48), gap: 8 },
    );

    const proof = params.proof;

    heading(layout, "Document");
    write(layout, `Formulaire : ${proof.document.title} (version ${proof.document.version})`, { size: 9 });
    write(layout, `Empreinte de la définition affichée : ${proof.document.contentHash}`, { size: 8 });
    write(layout, `Empreinte des réponses : ${proof.answers.hash}`, { size: 8 });
    write(layout, `Nombre de réponses enregistrées : ${proof.answers.count}`, { size: 8, gap: 4 });

    if (proof.attachment) {
      heading(layout, "Pièce annexée");
      write(
        layout,
        "Le document signé reproduit une pièce établie hors de Ryla, reprise " +
          "sans modification en tête du présent PDF.",
        { font: layout.italic, size: 8, color: rgb(0.45, 0.48, 0.53), gap: 3 },
      );
      write(layout, `Fichier : ${proof.attachment.filename}`, { size: 8.5 });
      if (proof.attachment.source) {
        write(layout, `Origine déclarée : ${proof.attachment.source}`, { size: 8.5 });
      }
      write(layout, `Taille : ${proof.attachment.byteSize} octets`, { size: 8.5 });
      write(layout, `Empreinte de la pièce : ${proof.attachment.sha256}`, {
        size: 8,
        gap: 4,
      });
    }

    heading(layout, "Horodatage");
    for (const [label, key] of [
      ["Envoi au patient", "sentAt"],
      ["Première ouverture", "firstOpenedAt"],
      ["Début de saisie", "startedAt"],
      ["Fin de saisie", "completedAt"],
      ["Signature", "signedAt"],
    ] as const) {
      write(layout, `${label} : ${formatTimestamp(proof.timeline[key] ?? null)}`, { size: 8.5 });
    }

    heading(layout, "Parcours de lecture");
    write(
      layout,
      "Temps d'affichage mesuré par le navigateur du patient, section par section.",
      { font: layout.italic, size: 8, color: rgb(0.45, 0.48, 0.53), gap: 3 },
    );
    for (const section of proof.reading.sections) {
      write(layout, `${section.sectionTitle} : ${formatDuration(section.ms)}`, { size: 8.5 });
    }
    write(layout, `Total : ${formatDuration(proof.reading.totalMs)}`, {
      font: layout.bold,
      size: 8.5,
      gap: 4,
    });

    heading(layout, "Environnement de signature");
    write(layout, `Adresse IP : ${proof.client.ip ?? "non renseignée"}`, { size: 8.5 });
    write(layout, `Navigateur : ${proof.client.userAgent ?? "non renseigné"}`, { size: 8.5 });
    write(layout, `Langue d'affichage : ${proof.client.locale ?? "fr"}`, { size: 8.5 });
    write(layout, `Niveau de signature (eIDAS) : ${proof.signer.level}`, { size: 8.5 });
    if (proof.otp) {
      write(
        layout,
        `Code à usage unique vérifié le ${formatTimestamp(proof.otp.verifiedAt)} ` +
          `(${proof.otp.channel} vers ${proof.otp.destinationHint})`,
        { size: 8.5 },
      );
    }

    heading(layout, "Scellement");
    write(layout, `Empreinte du dossier de preuve : ${proof.hash}`, { size: 8 });
    write(layout, `Chaîne d'audit du cabinet : ${proof.auditChainHead ?? "—"}`, { size: 8, gap: 4 });
    write(
      layout,
      "L'empreinte SHA-256 du présent PDF n'y figure pas — un document ne peut " +
        "pas contenir sa propre empreinte. Elle est calculée à l'enregistrement, " +
        "conservée avec la signature et consignée au journal d'audit du cabinet. " +
        "Les deux scellements se vérifient indépendamment.",
      { font: layout.italic, size: 8, color: rgb(0.45, 0.48, 0.53), gap: 4 },
    );
    write(
      layout,
      "Toute modification ultérieure de ce document, des réponses ou du journal " +
        "d'audit rend ces empreintes incohérentes, et donc détectable.",
      { font: layout.italic, size: 8, color: rgb(0.45, 0.48, 0.53) },
    );
  }

  // --- Pieds de page -------------------------------------------------------
  // Les pages importées en sont exemptes : écrire par-dessus le devis d'un
  // cabinet, c'est le modifier, et c'est précisément ce qu'on s'interdit.
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    if (index < attachedPages) return;
    page.drawText(
      sanitize(`${params.tenant.name} — ${params.definition.title}`),
      { x: MARGIN, y: 28, size: 7, font: layout.regular, color: rgb(0.55, 0.58, 0.62) },
    );
    const label = `${index + 1} / ${pages.length}`;
    page.drawText(label, {
      x: A4.width - MARGIN - layout.regular.widthOfTextAtSize(label, 7),
      y: 28,
      size: 7,
      font: layout.regular,
      color: rgb(0.55, 0.58, 0.62),
    });
  });

  const bytes = await doc.save();
  return { bytes, sha256: sha256Hex(Buffer.from(bytes)) };
}
