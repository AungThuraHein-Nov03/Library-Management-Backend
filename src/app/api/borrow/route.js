// Borrow request API with role-based authorization
// GET: ADMIN sees all requests, USER sees only their own
// POST: All authenticated users can create borrow requests

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getOverdueDays(dueDate, referenceDate = new Date()) {
  if (!dueDate) return 0;
  const diff = referenceDate.getTime() - dueDate.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / DAY_IN_MS);
}

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

    // Keep overdue tracking up-to-date when records are queried.
    await db.collection("borrows").updateMany(
      {
        status: "ACCEPTED",
        dueDate: { $type: "date", $lt: new Date() }
      },
      {
        $set: {
          status: "OVERDUE",
          overdueMarkedAt: new Date()
        }
      }
    );
    
    let query = {};
    // ADMIN can see all requests, USER sees only their own
    if (user.role !== "ADMIN") {
      query.userId = user.id;
    }
    
    const requests = await db.collection("borrows").find(query).toArray();
    const now = new Date();
    const requestsWithOverdueInfo = requests.map((request) => {
      const dueDate = request.dueDate ? new Date(request.dueDate) : null;
      const hasValidDueDate = dueDate && !Number.isNaN(dueDate.getTime());
      const trackable = request.status === "ACCEPTED" || request.status === "OVERDUE";
      const overdueDays = trackable && hasValidDueDate ? getOverdueDays(dueDate, now) : 0;

      return {
        ...request,
        isOverdue: overdueDays > 0,
        overdueDays,
      };
    });

    return NextResponse.json(requestsWithOverdueInfo, {
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

    const parsedTargetDate = parseDateInput(targetDate);
    if (!parsedTargetDate) {
      return NextResponse.json({
        message: "Target date is invalid"
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
      targetDate: parsedTargetDate,
      dueDate: null,
      acceptedAt: null,
      returnedAt: null
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