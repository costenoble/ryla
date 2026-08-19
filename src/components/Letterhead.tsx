import type { LetterheadBlock } from "@/lib/letterhead";

/**
 * En-tête du cabinet, tel qu'il sera imprimé.
 *
 * Composant unique, partagé par l'aperçu des réglages et par celui du devis.
 * Les deux avaient chacun leur rendu, et ils ont divergé exactement comme
 * c'était prévisible : le praticien composait son en-tête dans les réglages,
 * le retrouvait autrement dans l'aperçu du devis, et ne savait plus lequel des
 * deux disait vrai.
 *
 * Les trois tailles suivent celles de `LETTERHEAD_SIZES` dans `pdf.ts`, à
 * l'échelle de l'aperçu. Le rapport entre elles est ce qui compte : c'est lui
 * qui doit se retrouver sur le document imprimé.
 */

const SIZE_CLASS: Record<NonNullable<LetterheadBlock["size"]>, string> = {
  title: "text-[15px]",
  normal: "text-xs",
  small: "text-[10px]",
};

const ALIGN_CLASS: Record<NonNullable<LetterheadBlock["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function Letterhead({
  mode,
  blocks,
  hasImage,
  fallbackName,
}: {
  mode: string;
  blocks: LetterheadBlock[];
  hasImage: boolean;
  /** Affiché quand aucun en-tête n'est défini : mieux qu'un cadre vide. */
  fallbackName: string;
}) {
  if (mode === "image") {
    return hasImage ? (
      // Image privée servie par une route authentifiée : `next/image` ne
      // saurait pas l'optimiser et n'a rien à y gagner ici.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/api/branding/letterhead"
        alt="En-tête du cabinet"
        className="max-h-28 w-full object-contain object-left"
      />
    ) : (
      <p className="text-xs text-faint">Aucune image envoyée pour l'instant.</p>
    );
  }

  if (mode === "text") {
    if (blocks.length === 0) {
      return <p className="text-xs text-faint">Bloc d'en-tête vide.</p>;
    }
    return (
      <div className="space-y-0.5">
        {blocks.map((block, index) => (
          <p
            key={index}
            className={`wrap-break-word text-body ${SIZE_CLASS[block.size ?? "normal"]} ${
              block.bold ? "font-bold" : ""
            } ${ALIGN_CLASS[block.align ?? "left"]}`}
          >
            {block.text}
          </p>
        ))}
      </div>
    );
  }

  return <p className="text-xs font-bold text-body">{fallbackName}</p>;
}
