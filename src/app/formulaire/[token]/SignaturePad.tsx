"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracé manuscrit de la signature.
 *
 * Volontairement modeste : ce dessin n'a pratiquement aucune valeur probante
 * en soi. Ce qui compte, c'est le faisceau de preuves qui l'entoure —
 * horodatage, empreintes, parcours de lecture. Le tracé sert surtout à rendre
 * l'acte de signer conscient et délibéré, ce qui n'est pas rien.
 */

type Props = {
  onChange: (dataUrl: string | null) => void;
};

export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1e293b";
  }, []);

  useEffect(() => {
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, [setup]);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawing.current = true;
    const { x, y } = position(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = position(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-body">Votre signature</span>
        {hasDrawn ? (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-muted underline underline-offset-2 hover:text-body"
          >
            Effacer
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        // touch-none : sans ça, le geste de signature fait défiler la page.
        className="mt-2 h-36 w-full touch-none rounded-2xl border border-dashed border-line-strong bg-surface"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      {!hasDrawn ? (
        <p className="mt-1.5 text-xs text-muted">
          Signez avec le doigt ou la souris dans le cadre ci-dessus.
        </p>
      ) : null}
    </div>
  );
}
