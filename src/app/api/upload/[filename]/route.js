// Book cover delete API
// DELETE: Remove a book cover image (ADMIN only)

import corsHeaders from "@/lib/cors";
import { requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function DELETE(req, { params }) {
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
    const { filename } = await params;

    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({
        message: "Invalid filename"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", "covers", filename);
    await unlink(filePath);

    return NextResponse.json({
      message: "Cover deleted successfully"
    }, {
      headers: corsHeaders
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return NextResponse.json({
        message: "File not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }
    return NextResponse.json({
      message: error.toString()
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
