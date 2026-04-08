# Library Management Backend

Backend API for the Library Management System, built with Next.js App Router route handlers and MongoDB.

This service provides:
- Authentication with HTTP-only JWT cookies
- Role-based authorization (ADMIN and USER)
- Book management with soft delete
- Borrow request lifecycle management
- Local book cover upload and atomic cover replacement

## Tech Stack

- Next.js 16 (API routes only)
- MongoDB native driver
- JWT (`jsonwebtoken`) for authentication
- `bcrypt` for password hashing
- Docker (optional deployment)

## Project Structure

```text
src/
	app/
		admin/initial/route.js          # One-time index/seed endpoint
		api/
			user/
				route.js                    # Register user
				login/route.js              # Login and set JWT cookie
				logout/route.js             # Logout and clear cookie
				profile/route.js            # Current user profile
			books/
				route.js                    # List/search books, create book
				[id]/route.js               # Read/update/delete (soft) by id
				[id]/cover/route.js         # Atomic replace/remove cover by book id
			borrow/
				route.js                    # List/create borrow requests
				[id]/route.js               # Update borrow request status
			upload/
				route.js                    # Raw cover upload endpoint
				[filename]/route.js         # Raw cover file delete endpoint
	lib/
		auth.js                         # JWT verification and role checks
		cors.js                         # CORS headers
		ensureIndexes.js                # DB indexes and seed users
		mongodb.js                      # Mongo connection helper

public/
	uploads/covers/                   # Stored cover image files
```

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB instance (local or Atlas)

## Environment Variables

Create `Library-Management-Backend/.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/library
JWT_SECRET=replace-with-a-strong-random-secret
ADMIN_SETUP_PASS=replace-with-setup-password
```

Notes:
- `MONGODB_URI` is required.
- `JWT_SECRET` currently has a fallback value in code; set your own secret in all environments.
- `ADMIN_SETUP_PASS` is required to call the initialization endpoint.

## Local Development

```bash
npm install
npm run dev
```

API base URL:
- `http://localhost:3000`

## Initialize Database (Indexes and Seed Users)

Run once after startup:

```http
GET /admin/initial?pass=<ADMIN_SETUP_PASS>
```

This will:
- Ensure indexes:
	- `users.username` unique
	- `users.email` unique
	- `books.title` index
	- `books.isbn` unique
- Seed accounts if missing:
	- Admin: `admin@test.com` / `admin123`
	- User: `user@test.com` / `user123`

## Authentication and Authorization

### Auth Model

- Login sets a `token` HTTP-only cookie (7 days)
- Protected endpoints read and verify the cookie
- Frontend requests must send `credentials: "include"`

### Role Model

- `USER`: browse books, create/cancel own borrow requests
- `ADMIN`: all USER actions plus book CRUD, cover management, borrow moderation

### Registration Safety

`POST /api/user` always assigns `role: "USER"` to prevent self-assigning admin rights.

## API Overview

All routes return JSON.

### User

- `POST /api/user` - register
- `POST /api/user/login` - login and set cookie
- `POST /api/user/logout` - clear cookie
- `GET /api/user/profile` - current profile (auth required)

### Books

- `GET /api/books` - list books (auth required)
	- Query params: `title`, `author`
	- ADMIN sees all statuses; non-admin users do not see `DELETED`
- `POST /api/books` - create book (ADMIN)
- `GET /api/books/:id` - get book (auth required)
- `PATCH /api/books/:id` - update book (ADMIN)
- `DELETE /api/books/:id` - soft delete by setting `status = DELETED` (ADMIN)

### Cover Images

- `POST /api/books/:id/cover` - replace a book cover atomically (ADMIN)
	- Valid types: JPEG, PNG, WebP
	- Max size: 2 MB
	- Writes file to `public/uploads/covers`
	- Rolls back new file if DB update fails
	- Best-effort deletes previous cover file
- `DELETE /api/books/:id/cover` - remove cover from book and delete file (ADMIN)
- `POST /api/upload` - raw upload endpoint (ADMIN)
- `DELETE /api/upload/:filename` - raw file delete endpoint (ADMIN)

### Borrow Requests

- `GET /api/borrow` - list borrow requests (auth required)
	- ADMIN sees all
	- USER sees only own records
- `POST /api/borrow` - create request (auth required)
	- If `book.available > 0`: status `INIT` and decrements available count
	- Otherwise: status `CLOSE-NO-AVAILABLE-BOOK`
- `PATCH /api/borrow/:id` - update request status (auth required)

Valid transitions:
- `INIT -> ACCEPTED` (ADMIN)
- `INIT -> CANCEL-ADMIN` (ADMIN)
- `INIT -> CANCEL-USER` (request owner only)
- `ACCEPTED -> RETURNED` (ADMIN)

Inventory restoration:
- `INIT -> CANCEL-ADMIN` or `INIT -> CANCEL-USER`: increments `books.available`
- `ACCEPTED -> RETURNED`: increments `books.available`

## CORS and Frontend Integration

Current CORS allow origin is hardcoded to:
- `http://localhost:5173`

If your frontend runs elsewhere, update `src/lib/cors.js`.

Frontend expected API variable:
- `VITE_API_URL=http://localhost:3000`

## Scripts

```bash
npm run dev     # Start development server
npm run build   # Create production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Docker

Build and run:

```bash
docker build -t library-backend .
docker run --rm -p 3000:3000 \
	-e MONGODB_URI="<your-mongodb-uri>" \
	-e JWT_SECRET="<your-secret>" \
	-e ADMIN_SETUP_PASS="<your-setup-pass>" \
	library-backend
```

Important for cover persistence:
- Cover files are stored on local filesystem (`public/uploads/covers`)
- In containerized environments, use a volume mount or external object storage to avoid data loss on container recreation

## Typical Development Flow

1. Start MongoDB
2. Start backend (`npm run dev`)
3. Call `/admin/initial?pass=...` once
4. Start frontend and log in with seeded admin account
5. Test book CRUD, cover upload, and borrow transitions

## License

This project is licensed under the MIT License.

See the repository root license file:
- `../LICENSE`
