"use client";

export function SceneFallback({
  productName,
  imageUrl,
}: {
  productName: string;
  imageUrl?: string;
}) {
  return (
    <div className="proposal-scene-fallback" aria-label={`תצוגת חוף עבור ${productName}`}>
      <div className="proposal-fallback-sky" aria-hidden />
      <div className="proposal-fallback-sea" aria-hidden />
      <div className="proposal-fallback-sand" aria-hidden />
      {imageUrl && (
        <div className="proposal-fallback-product">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={productName} />
        </div>
      )}
    </div>
  );
}
