import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { catalogModels } from "@/lib/json-db/queries";
import { quoteByToken } from "@/lib/quotes/service";

export const dynamic = "force-dynamic";

/**
 * Generates a 1200x630 PNG OpenGraph / WhatsApp preview image for a proposal link,
 * compositing the exact product cutout photo onto a warm Mediterranean coastal studio card.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const quote = await quoteByToken(token);
  if (!quote) {
    return new NextResponse("Not found", { status: 404 });
  }

  const models = await catalogModels();
  const model = models.find((m) => m.id === quote.modelId);
  const cutoutPath = model ? getProposalHeroCutoutUrl(model) : undefined;

  // Create a 1200x630 Mediterranean coastal gradient backdrop via SVG
  const backdropSvg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#87C9E8" />
          <stop offset="52%" stop-color="#E6F4F7" />
          <stop offset="68%" stop-color="#38B8B4" />
          <stop offset="76%" stop-color="#BFEAE4" />
          <stop offset="100%" stop-color="#E9D5AE" />
        </linearGradient>
        <radialGradient id="sun" cx="25%" cy="28%" r="28%">
          <stop offset="0%" stop-color="#FFFDF0" stop-opacity="0.95" />
          <stop offset="45%" stop-color="#FFD97D" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#FFD97D" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#sky)" />
      <rect width="1200" height="630" fill="url(#sun)" />
      <ellipse cx="600" cy="545" rx="340" ry="26" fill="#0B2433" fill-opacity="0.18" />
    </svg>
  `;

  try {
    let baseImage = sharp(Buffer.from(backdropSvg)).resize(1200, 630);

    if (cutoutPath && cutoutPath.startsWith("/")) {
      const diskPath = path.join(process.cwd(), "public", cutoutPath.replace(/^\//, ""));
      try {
        const rawBytes = await readFile(diskPath);
        const productLayer = await sharp(rawBytes)
          .resize(860, 520, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        baseImage = baseImage.composite([{ input: productLayer, top: 45, left: 170 }]);
      } catch {
        // Fallback to coastal backdrop if local file is missing
      }
    }

    const pngBuffer = await baseImage.png({ quality: 90 }).toBuffer();
    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Error generating image", { status: 500 });
  }
}
