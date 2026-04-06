// Book cover upload API
// POST: Upload a book cover image (ADMIN only)

import corsHeaders from "@/lib/cors";
import { requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req) {
  const { authorized, user, reason } = requireRole(req, ["ADMIN"]);
  if (!authorized) {
    return NextResponse.json({
      message: reason || "Forbidden"
    }, {
      status: user ? 403 : 401,
      headers: corsHeaders
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("cover");

    if (!file) {
      return NextResponse.json({
        message: "No file provided"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        message: "Only JPG, PNG, and WebP images are allowed"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({
        message: "Image must be under 2MB"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${uuidv4()}.${ext}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "covers");

    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(path.join(uploadsDir, filename), buffer);

    return NextResponse.json({
      url: `/uploads/covers/${filename}`
    }, {
      status: 201,
      headers: corsHeaders
    });
  } catch (error) {
    return NextResponse.json({
      message: error.toString()
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
