// Borrow request management by ID
// PATCH: Update borrow request status with proper transitions

import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// Valid status transitions:
// INIT -> ACCEPTED (ADMIN)
// INIT -> CANCEL-ADMIN (ADMIN)
// INIT -> CANCEL-USER (USER - own request only)
// ACCEPTED -> RETURNED (ADMIN)
// ACCEPTED -> OVERDUE (automatic tracking)
// OVERDUE -> RETURNED (ADMIN)
// CLOSE-NO-AVAILABLE-BOOK is a terminal state (no transitions out)
// RETURNED is a terminal state
// CANCEL-ADMIN is a terminal state
// CANCEL-USER is a terminal state

const VALID_TRANSITIONS = {
  "INIT": ["ACCEPTED", "CANCEL-ADMIN", "CANCEL-USER"],
  "ACCEPTED": ["RETURNED"],
  "OVERDUE": ["RETURNED"]
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

    let currentStatus = borrow.status;
    const currentDueDate = borrow.dueDate ? new Date(borrow.dueDate) : null;
    if (
      currentStatus === "ACCEPTED" &&
      currentDueDate &&
      !Number.isNaN(currentDueDate.getTime()) &&
      currentDueDate < new Date()
    ) {
      currentStatus = "OVERDUE";
      await db.collection("borrows").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "OVERDUE",
            overdueMarkedAt: new Date(),
            updatedAt: new Date(),
          }
        }
      );
    }

    // Check valid transition
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      return NextResponse.json({
        message: `Cannot transition from ${currentStatus} to ${newStatus}`
      }, {
        status: 400,
        headers: corsHeaders
      });
    }

    // Role-based transition rules
    if (newStatus === "ACCEPTED" || newStatus === "CANCEL-ADMIN" || newStatus === "RETURNED") {
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
    const updateFields = {
      status: newStatus,
      updatedAt: new Date(),
      updatedBy: user.id
    };

    if (newStatus === "ACCEPTED") {
      const now = new Date();
      const requestedDueDate = parseDateInput(data.dueDate);
      const targetDueDate = parseDateInput(borrow.targetDate);
      const dueDate = requestedDueDate || targetDueDate;

      if (!dueDate) {
        return NextResponse.json({
          message: "Cannot assign due date: missing valid target date"
        }, {
          status: 400,
          headers: corsHeaders
        });
      }

      if (dueDate <= now) {
        return NextResponse.json({
          message: "Due date must be in the future"
        }, {
          status: 400,
          headers: corsHeaders
        });
      }

      updateFields.acceptedAt = now;
      updateFields.dueDate = dueDate;
      updateFields.overdueMarkedAt = null;
    }

    if (newStatus === "RETURNED") {
      updateFields.returnedAt = new Date();
    }

    await db.collection("borrows").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: updateFields
      }
    );

    // If cancelling an INIT request, restore book availability
    if ((newStatus === "CANCEL-ADMIN" || newStatus === "CANCEL-USER") && currentStatus === "INIT") {
      await db.collection("books").updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { available: 1 } }
      );
    }

    // When an accepted borrow is returned, restore book availability
    if (newStatus === "RETURNED" && (currentStatus === "ACCEPTED" || currentStatus === "OVERDUE")) {
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
