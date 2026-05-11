// Booking Model Schema
// Enrollment table — one row per student-course pair.
// Stores all fields from the 3-step enroll form (Step 1 personal details + Step 2 schedule).
// Store this for reference when creating tables.

const BookingSchema = {
  id: 'SERIAL PRIMARY KEY',
  student_id: 'INTEGER NOT NULL',
  class_id: 'INTEGER NOT NULL REFERENCES courses(id)',
  status: "VARCHAR(50) DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'active', 'cancelled'))",
  
  // ── Step 1 fields from enroll page ────────────────
  full_name: 'VARCHAR(255)',
  phone: 'VARCHAR(20)',
  school: 'VARCHAR(255)',
  grade: 'VARCHAR(50)',
  message: 'TEXT',    // optional message to tutor

  // ── Step 2 fields from enroll page ────────────────
  preferred_mode: "VARCHAR(50)",
  selected_day: 'VARCHAR(50)',   // e.g. "Monday"
  selected_time: 'VARCHAR(50)',   // e.g. "6:00 PM"

  // ── Progress tracking ──────────────────────────────
  sessions_attended: 'INTEGER DEFAULT 0',
  
  createdAt: 'TIMESTAMP DEFAULT NOW()',
  updatedAt: 'TIMESTAMP DEFAULT NOW()',
};

module.exports = BookingSchema;
