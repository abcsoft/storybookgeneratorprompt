import { NextResponse } from "next/server";
import { validateStoryMatch } from "@/lib/semantic/semanticValidator";

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image file provided for semantic check." }, { status: 400 });
    }

    const slotId = (formData.get("slotId") as string) || "slot";
    const roleSlug = (formData.get("roleSlug") as string) || "scene";
    const expectedRole = (formData.get("expectedRole") as string) || roleSlug;
    const storyText = (formData.get("storyText") as string) || "";
    const prompt = (formData.get("prompt") as string) || "";

    let otherSlots: any[] = [];
    const otherSlotsRaw = formData.get("otherSlots") as string | null;
    if (otherSlotsRaw) {
      try {
        otherSlots = JSON.parse(otherSlotsRaw);
      } catch {
        /* ignore */
      }
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());

    const result = await validateStoryMatch({
      slotId,
      filename: file.name,
      expectedRole,
      roleSlug,
      storyText,
      prompt,
      imageBuffer,
      mimeType: file.type || "image/png",
      otherSlots,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Semantic check failed." },
      { status: 500 },
    );
  }
}
