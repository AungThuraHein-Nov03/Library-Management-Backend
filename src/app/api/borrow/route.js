// Borrow request API with role-based authorization
// GET: ADMIN sees all requests, USER sees only their own
// POST: All authenticated users can create borrow requests

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(req) {
  // All authenticated users can view borrow requests
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
    
    let query = {};
    // ADMIN can see all requests, USER sees only their own
    if (user.role !== "ADMIN") {
      query.userId = user.id;
    }
    
    const requests = await db.collection("borrows").find(query).toArray();
    return NextResponse.json(requests, {
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
  // All authenticated users can create borrow requests
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
    const data = await req.json();
    const { bookId, targetDate } = data;

    if (!bookId) {
      return NextResponse.json({
        message: "Book ID is required"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    if (!targetDate) {
      return NextResponse.json({
        message: "Target date is required"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    if (!ObjectId.isValid(bookId)) {
      return NextResponse.json({ message: "Invalid book ID" }, { status: 400, headers: corsHeaders });
    }

    const client = await getClientPromise();
    const db = client.db("library");
    
    // Check if book exists
    const book = await db.collection("books").findOne({ _id: new ObjectId(bookId) });
    if (!book) {
      return NextResponse.json({
        message: "Book not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    // Cannot borrow a deleted book
    if (book.status === "DELETED") {
      return NextResponse.json({
        message: "This book is no longer available"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    // Determine initial status based on availability
    let status;
    if (book.available > 0) {
      status = "INIT";
      // Decrease available count
      await db.collection("books").updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { available: -1 } }
      );
    } else {
      status = "CLOSE-NO-AVAILABLE-BOOK";
    }

    // Create borrow request
    const result = await db.collection("borrows").insertOne({
      bookId: bookId,
      bookTitle: book.title,
      userId: user.id,
      userEmail: user.email,
      status: status,
      createdAt: new Date(),
      targetDate: new Date(targetDate)
    });

    return NextResponse.json({
      id: result.insertedId,
      message: "Borrow request created successfully"
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