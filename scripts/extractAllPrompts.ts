import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const mdPath = path.resolve(process.cwd(), "storybook-out/yasfa/prompts.md");
  const content = await fs.readFile(mdPath, "utf-8");

  // Regex to match: ### Illustration (\d+) · ([^·\n]+) · ...
  // and: _Page text (for reference — do not put this in the image):_ (.*)
  const illos: { index: number; pageNumber: number; role: string; text: string }[] = [];

  const sections = content.split(/### Illustration /);
  for (const s of sections.slice(1)) {
    const headerMatch = s.match(/^(\d+)\s*·\s*([^·\n]+)/);
    const textMatch = s.match(/_Page text[^:]*:\s*([^\n\r]+)/);

    if (headerMatch && textMatch) {
      const pageNumber = parseInt(headerMatch[1], 10);
      const role = headerMatch[2].trim();
      let text = textMatch[1].trim();
      if (text.startsWith("_")) text = text.substring(1).trim();
      if (text.endsWith("_")) text = text.substring(0, text.length - 1).trim();
      illos.push({
        index: pageNumber - 1,
        pageNumber,
        role,
        text,
      });
    }
  }

  console.log(`Extracted ${illos.length} illustrations:`);
  console.log(JSON.stringify(illos, null, 2));

  const outPath = path.resolve(process.cwd(), "storybook-out/yasfa/storyPages.json");
  await fs.writeFile(outPath, JSON.stringify(illos, null, 2), "utf-8");
  console.log("Saved to:", outPath);
}

main().catch(console.error);
