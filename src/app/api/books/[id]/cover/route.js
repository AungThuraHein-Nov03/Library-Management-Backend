import corsHeaders from "@/lib/cors";
import { requireRole } from "@/lib/auth";
import { getClientPromise } from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function getFilenameFromCoverUrl(coverUrl) {
  if (!coverUrl || typeof coverUrl !== "string") return null;
  if (!coverUrl.startsWith("/uploads/covers/")) return null;

  const filename = coverUrl.split("/").pop();
  if (!filename) return null;

  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }

  return filename;
}

async function deleteCoverFile(filename) {
  if (!filename) return;
  const filePath = path.join(process.cwd(), "public", "uploads", "covers", filename);

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req, { params }) {
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
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid book ID" }, { status: 400, headers: corsHeaders });
    }

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

    const client = await getClientPromise();
    const db = client.db("library");

    const currentBook = await db.collection("books").findOne({ _id: new ObjectId(id) });
    if (!currentBook) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    const extRaw = (file.name || "").split(".").pop()?.toLowerCase();
    const ext = ["jpg", "jpeg", "png", "webp"].includes(extRaw) ? extRaw : "jpg";
    const filename = `${uuidv4()}.${ext}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "covers");
    const coverUrl = `/uploads/covers/${filename}`;

    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(path.join(uploadsDir, filename), buffer);

    try {
      const result = await db.collection("books").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            coverImage: coverUrl,
            updatedAt: new Date(),
            updatedBy: user.id,
          }
        }
      );

      if (result.matchedCount === 0) {
        await deleteCoverFile(filename);
        return NextResponse.json({
          message: "Book not found"
        }, {
          status: 404,
          headers: corsHeaders
        });
      }
    } catch (error) {
      await deleteCoverFile(filename);
      throw error;
    }

    const oldFilename = getFilenameFromCoverUrl(currentBook.coverImage);
    if (oldFilename && oldFilename !== filename) {
      try {
        await deleteCoverFile(oldFilename);
      } catch (error) {
        console.error("Failed to delete old cover file", error);
      }
    }

    return NextResponse.json({
      url: coverUrl,
      message: "Cover replaced successfully"
    }, {
      status: 200,
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
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid book ID" }, { status: 400, headers: corsHeaders });
    }

    const client = await getClientPromise();
    const db = client.db("library");

    const currentBook = await db.collection("books").findOne({ _id: new ObjectId(id) });
    if (!currentBook) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    const oldFilename = getFilenameFromCoverUrl(currentBook.coverImage);
    if (!oldFilename) {
      return NextResponse.json({
        message: "Book has no cover"
      }, {
        status: 200,
        headers: corsHeaders
      });
    }

    const result = await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          coverImage: "",
          updatedAt: new Date(),
          updatedBy: user.id,
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    try {
      await deleteCoverFile(oldFilename);
    } catch (error) {
      console.error("Failed to delete removed cover file", error);
      return NextResponse.json({
        message: "Cover removed from book, but file cleanup failed"
      }, {
        status: 200,
        headers: corsHeaders
      });
    }

    return NextResponse.json({
      message: "Cover removed successfully"
    }, {
      status: 200,
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
