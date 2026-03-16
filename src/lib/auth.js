// Authentication and role-based access control
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "mydefaulyjwtsecret";

// Verify JWT token from cookies and return user data
export function verifyAuth(request) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return null;
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

// Check if user is authenticated
export function requireAuth(request) {
  const user = verifyAuth(request);
  if (!user) {
    return { authenticated: false, user: null };
  }
  return { authenticated: true, user };
}

// Check if user has required role
export function requireRole(request, allowedRoles) {
  const { authenticated, user } = requireAuth(request);
  if (!authenticated) {
    return { authorized: false, user: null, reason: "Not authenticated" };
  }
  if (!allowedRoles.includes(user.role)) {
    return { authorized: false, user, reason: "Insufficient permissions" };
  }
  return { authorized: true, user };
}
