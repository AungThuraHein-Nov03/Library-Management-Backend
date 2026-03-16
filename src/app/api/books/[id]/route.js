// Book CRUD by ID with role-based authorization
// GET: All authenticated users can view book details
// PATCH/DELETE: Only ADMIN can update/delete books

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth, requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(req, { params }) {
  // All authenticated users can view book details
  // Only ADMIN can view deleted books
  const { authenticated, user } = requireAuth(req);
  if (!authenticated) {
    return NextResponse.json({
      message: "Unauthorized"
    }, {
      status: 401,
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
    const book = await db.collection("books").findOne({ _id: new ObjectId(id) });
    
    if (!book) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    // Non-ADMIN users cannot view deleted books
    if (book.status === "DELETED" && user.role !== "ADMIN") {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    return NextResponse.json(book, {
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

export async function PATCH(req, { params }) {
  // Only ADMIN can update books
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
    const data = await req.json();
    const { title, author, description, quantity, available } = data;

    const updateFields = {};
    if (title) updateFields.title = title;
    if (author) updateFields.author = author;
    if (description !== undefined) updateFields.description = description;
    if (quantity !== undefined) updateFields.quantity = quantity;
    if (available !== undefined) updateFields.available = available;
    if (data.location !== undefined) updateFields.location = data.location;
    if (data.status !== undefined) updateFields.status = data.status;
    updateFields.updatedAt = new Date();
    updateFields.updatedBy = user.id;

    const client = await getClientPromise();
    const db = client.db("library");
    const result = await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    return NextResponse.json({
      message: "Book updated successfully"
    }, {
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
  // Only ADMIN can delete books
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
    
    // Soft delete: set status to DELETED instead of removing
    const result = await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: "DELETED",
          deletedAt: new Date(),
          deletedBy: user.id
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

    return NextResponse.json({
      message: "Book deleted successfully"
    }, {
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
