import sharp from "sharp";
import { renderBookHtml } from "../lib/pdf/page-template";
import { buildBook } from "../lib/pdf/buildBook";
import type { GeneratedPage, ChildProfile } from "../lib/story/types";

async function test() {
  const child: ChildProfile = { name: "Leo", age: 5, gender: "boy" };
  const img = await sharp({
    create: { width: 3375, height: 2475, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } },
  }).png().toBuffer();

  const pages: GeneratedPage[] = [
    { index: 0, kind: "cover", text: "Leo's Book", image: img, imageMimeType: "image/png", failed: false, transform: { mode: "fill", scale: 1, offsetX: 0, offsetY: 0, backgroundMode: "none" } },
    { index: 1, kind: "intro", text: "Once upon a time.", image: img, imageMimeType: "image/png", failed: false, spread: false, transform: { mode: "fill", scale: 1, offsetX: 0, offsetY: 0, backgroundMode: "none" } },
  ];

  const pdf = await buildBook(pages, child);
  const str = pdf.toString("latin1");
  const regex = /<<[^>]*\/Subtype\s*\/Image[^>]*>>/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    console.log(m[0]);
  }
}

test().catch(console.error);
