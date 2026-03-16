// REFERENCE: This file is provided as a user registration example.
// Students must implement authentication and role-based logic as required in the exam.
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET (req) {
  // Check authentication
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
    const email = user.email;
    const profile = await db.collection("users").findOne(
      { email },
      { projection: { password: 0 } }
    );
    return NextResponse.json(profile, {
      headers: corsHeaders
    })
  }
  catch(error) {
    return NextResponse.json({
      message: error.toString()
    }, {
      status: 500,
      headers: corsHeaders
    })
  }
}