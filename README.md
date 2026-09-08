# Mentora Backend

A Node.js Express backend for the Mentora tutoring platform.

## Installation

```bash
npm install
```

## Configuration

Update `.env` file with your PostgreSQL credentials:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=mentora
```

## Running the Server

### Development mode (with auto-reload)
```bash
npm run dev
```

### Production mode
```bash
npm start
```

The server will run on `http://localhost:5000`

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/users` - Get all users
- `GET /api/tutors` - Get all tutors
- `GET /api/courses` - Get all courses
- `GET /api/payments` - Get all payments
- `GET /api/admin/dashboard` - Admin dashboard

## Folder Structure

```
src/
├── config/       # Database & environment config
├── controllers/  # Request handlers
├── models/       # Database models
├── routes/       # API routes
├── middleware/   # Custom middleware
├── services/     # Business logic services
├── utils/        # Helper utilities
└── uploads/      # File uploads directory
```

## Test Credentials

Use these credentials to test the application:

### Tutor Account
- **Email:** `janaka.abeywickrama@gmail.com`
- **Password:** `Janaka@123`
- **Name:** Janaka Abeywickrama
- **Test Classes:** Vector Matrix and Integration, Physics Fundamentals, Chemistry Basics

### Student Account
- **Email:** `testboy@gmail.com`
- **Password:** `testboy@123`
- **Name:** Test boy
- **School:** Test High School
- **Grade:** A/L

## Database

PostgreSQL is configured by default. Update the `.env` file with your database credentials.
