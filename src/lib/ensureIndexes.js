
// REFERENCE: This file is provided as an example for creating indexes.
// Students must add a similar index for the Book collection as required in the exam.
import { getClientPromise } from "@/lib/mongodb";
import bcrypt from "bcrypt";

export async function ensureIndexes() {
  const client = await getClientPromise();
  const db = client.db("library");
  const userCollection = db.collection("users");
  
  // Create user indexes
  await userCollection.createIndex({ username: 1 }, { unique: true });
  await userCollection.createIndex({ email: 1 }, { unique: true });
  
  // Create book indexes
  const bookCollection = db.collection("books");
  await bookCollection.createIndex({ title: 1 });
  await bookCollection.createIndex({ isbn: 1 }, { unique: true });
  
  // Seed test users if they don't exist
  const adminExists = await userCollection.findOne({ email: "admin@test.com" });
  if (!adminExists) {
    await userCollection.insertOne({
      username: "admin",
      email: "admin@test.com",
      password: await bcrypt.hash("admin123", 10),
      firstname: "Admin",
      lastname: "User",
      role: "ADMIN",
      status: "ACTIVE"
    });
  }
  
  const userExists = await userCollection.findOne({ email: "user@test.com" });
  if (!userExists) {
    await userCollection.insertOne({
      username: "user",
      email: "user@test.com",
      password: await bcrypt.hash("user123", 10),
      firstname: "Test",
      lastname: "User",
      role: "USER",
      status: "ACTIVE"
    });
  }
}