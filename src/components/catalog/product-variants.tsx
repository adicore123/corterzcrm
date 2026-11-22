"use client";
import type { StudioVariant } from "@/lib/validation/models";
export function ProductVariants({ variants, selected, onSelect }: { variants: StudioVariant[]; selected?: string; onSelect: (id: string | undefined) => void }) {
  if (!variants.length) return null;
  const variant = variants.find((item) => item.id === selected);
  return <section className="studio-variants" aria-label="גרסאות המוצר"><div><strong>בחרו את הגרסה שלכם</strong><span>{variant?.title ?? "דגם בסיס"}</span></div><div className="studio-variant-options"><button aria-pressed={!selected} onClick={() => onSelect(undefined)}>דגם בסיס</button>{variants.map((item) => <button key={item.id} aria-pressed={selected === item.id} onClick={() => onSelect(item.id)}>{item.color && <span className="studio-color-swatch" style={{ background: item.color }} />}{item.title}</button>)}</div>{variant && <p>{variant.sku && <span dir="ltr">{variant.sku} · </span>}{variant.availability === "available" ? "זמין לפי נתוני הקטלוג" : variant.availability === "unavailable" ? "אינו זמין כרגע" : "יש לבדוק זמינות מול נציג"}</p>}</section>;
}
