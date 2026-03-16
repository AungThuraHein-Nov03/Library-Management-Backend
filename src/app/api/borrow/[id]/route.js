// Borrow request management by ID
// PATCH: Update borrow request status with proper transitions

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

// Valid status transitions:
// INIT -> ACCEPTED (ADMIN)
// INIT -> CANCEL-ADMIN (ADMIN)
// INIT -> CANCEL-USER (USER - own request only)
// CLOSE-NO-AVAILABLE-BOOK is a terminal state (no transitions out)
// ACCEPTED is a terminal state
// CANCEL-ADMIN is a terminal state
// CANCEL-USER is a terminal state

const VALID_TRANSITIONS = {
  "INIT": ["ACCEPTED", "CANCEL-ADMIN", "CANCEL-USER"]
};

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function PATCH(req, { params }) {
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
      return NextResponse.json({ message: "Invalid borrow request ID" }, { status: 400, headers: corsHeaders });
    }
    const data = await req.json();
    const { status: newStatus } = data;

    if (!newStatus) {
      return NextResponse.json({
        message: "Status is required"
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    const client = await getClientPromise();
    const db = client.db("library");
    const borrow = await db.collection("borrows").findOne({ _id: new ObjectId(id) });

    if (!borrow) {
      return NextResponse.json({
        message: "Borrow request not found"
      }, {
        status: 404,
        headers: corsHeaders
      });
    }

    // Check valid transition
    const allowed = VALID_TRANSITIONS[borrow.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return NextResponse.json({
        message: `Cannot transition from ${borrow.status} to ${newStatus}`
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    // Role-based transition rules
    if (newStatus === "ACCEPTED" || newStatus === "CANCEL-ADMIN") {
      if (user.role !== "ADMIN") {
        return NextResponse.json({
          message: "Only ADMIN can perform this action"
        }, {
          status: 403,
          headers: corsHeaders
        });
      }
    }

    if (newStatus === "CANCEL-USER") {
      if (user.role === "ADMIN") {
        return NextResponse.json({
          message: "ADMIN must use CANCEL-ADMIN instead"
        }, {
          status: 403,
          headers: corsHeaders
        });
      }
      if (borrow.userId !== user.id) {
        return NextResponse.json({
          message: "You can only cancel your own requests"
        }, {
          status: 403,
          headers: corsHeaders
        });
      }
    }

    // Update the status
    await db.collection("borrows").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
          updatedBy: user.id
        }
      }
    );

    // If cancelling an INIT request, restore book availability
    if ((newStatus === "CANCEL-ADMIN" || newStatus === "CANCEL-USER") && borrow.status === "INIT") {
      await db.collection("books").updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { available: 1 } }
      );
    }

    return NextResponse.json({
      message: `Request status updated to ${newStatus}`
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
