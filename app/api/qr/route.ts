import { NextRequest, NextResponse } from "next/server";

import { createQrSvg, qrByteLength } from "@/app/lib/qr-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("value")?.trim() ?? "";
  const size = Number(request.nextUrl.searchParams.get("size") ?? 256);

  if (!value) {
    return NextResponse.json({ ok: false, error: "QR_DATA_REQUIRED" }, { status: 400 });
  }
  if (qrByteLength(value) > 260) {
    return NextResponse.json({ ok: false, error: "QR_DATA_TOO_LONG" }, { status: 413 });
  }

  try {
    const svg = createQrSvg(value, { size, margin: 4 });
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[api/qr]", error);
    return NextResponse.json({ ok: false, error: "QR_GENERATION_FAILED" }, { status: 400 });
  }
}
