// Book CRUD API with role-based authorization
// GET: All authenticated users can list books
// POST: Only ADMIN can create books

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth, requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(req) {
  // All authenticated users can list books
  // ADMIN can see all books including deleted, USER sees only active books
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
    const client = await getClientPromise();
    const db = client.db("library");
    
    // Filter: ADMIN sees all books, USER sees only ACTIVE books
    const query = user.role === "ADMIN" ? {} : { status: { $ne: "DELETED" } };

    // Search filters from query params
    const { searchParams } = new URL(req.url);
    const titleFilter = searchParams.get("title");
    const authorFilter = searchParams.get("author");
    if (titleFilter) query.title = { $regex: titleFilter, $options: "i" };
    if (authorFilter) query.author = { $regex: authorFilter, $options: "i" };

    const books = await db.collection("books").find(query).toArray();
    return NextResponse.json(books, {
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

export async function POST(req) {
  // Only ADMIN can create books
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
    const data = await req.json();
    const { title, author, isbn, description, quantity } = data;

    if (!title || !author || !isbn) {
      return NextResponse.json({
        message: "Missing required fields: title, author, isbn"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    const client = await getClientPromise();
    const db = client.db("library");
    const result = await db.collection("books").insertOne({
      title,
      author,
      isbn,
      description: data.description || "",
      quantity: quantity || 1,
      available: quantity || 1,
      location: data.location || "",
      status: "ACTIVE",
      createdAt: new Date(),
      createdBy: user.id
    });

    return NextResponse.json({
      id: result.insertedId,
      message: "Book created successfully"
    }, {
      status: 201,
      headers: corsHeaders
    });
  } catch (error) {
    const errorMsg = error.toString();
    if (errorMsg.includes("duplicate") && errorMsg.includes("isbn")) {
      return NextResponse.json({
        message: "ISBN already exists"
      }, {
        status: 400,
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
