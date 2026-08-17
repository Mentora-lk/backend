// src/controllers/enrollmentController.js

const { pool } = require('../config/db');
const sendEmail = require('../utils/sendEmail');
const enrollmentEmailTemplate = require('../utils/enrollmentEmailTemplate');
const enrollmentStatusEmailTemplate = require('../utils/enrollmentStatusEmailTemplate');

// Shared required-field check for both creating and editing an enrollment's
// content fields. classId is validated separately by callers since it only
// applies to creation (the enrolled class isn't editable after the fact).
function validateEnrollmentFields({ fullName, email, phone, grade, selectedDay, selectedTime }) {
  if (!fullName || !email || !phone || !grade || !selectedDay || !selectedTime) {
    return 'Missing required enrollment fields';
  }
  return null;
}

// Single enrollment joined with its course/tutor info — the same shape
// getMyEnrollments returns per row. Shared by getEnrollmentById and
// updateEnrollmentDetails so both stay in sync with GET /mine.
async function fetchEnrollmentWithCourse(id) {
  const result = await pool.query(
    `SELECT e.*, c.title, c.subject, c.mode, c.location, c.fee, c.image,
            c.average_rating, c.max_students, c.schedule, c.badge,
            tp.full_name AS tutor_name, tp.id AS tutor_id, tp.profile_picture_url AS tutor_avatar
     FROM enrollments e
     LEFT JOIN courses c ON e.class_id = c.id
     LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
     WHERE e.id = $1`,
    [id]
  );
  return result.rows[0];
}

//!POST /api/enrollments
const createEnrollment = async (req, res, next) => {
  try {
    const {
      classId,
      fullName,
      email,
      phone,
      school,
      grade,
      message,
      preferredMode,
      selectedDay,
      selectedTime,
    } = req.body;

    if (!classId) {
      return res.status(400).json({ message: 'Missing required enrollment fields' });
    }

    const validationError = validateEnrollmentFields({ fullName, email, phone, grade, selectedDay, selectedTime });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    // Use authenticated user's ID, fallback to 1 if not authenticated
    const studentId = req.user?.id || 1;

    // Check course exists
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [classId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = courseResult.rows[0];

    if (course.status !== 'active') {
      return res.status(400).json({ message: 'This course is not accepting enrollments' });
    }

    // Prevent duplicate open requests only
    const existingResult = await pool.query(
      `SELECT * FROM enrollments
       WHERE student_id = $1
         AND class_id = $2
         AND status IN ('pending', 'requested')`,
      [studentId, classId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        message: 'You already have a pending request for this class',
      });
    }

    // Check max students
    const enrolledResult = await pool.query(
      "SELECT COUNT(*) FROM enrollments WHERE class_id = $1 AND status IN ('approved', 'active')",
      [classId]
    );

    const enrolledCount = parseInt(enrolledResult.rows[0].count);

    if (enrolledCount >= course.max_students) {
      return res.status(400).json({ message: 'This class is full' });
    }

    //! Create enrollment
    const bookingResult = await pool.query(
      `INSERT INTO enrollments
        (student_id, class_id, status, full_name, email, phone, school, grade, message, preferred_mode, selected_day, selected_time, "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        studentId,
        classId,
        'requested', // enrollments.status CHECK constraint doesn't allow 'pending' — matches the initial state used elsewhere (Booking.js, updateEnrollmentStatus target values)
        fullName,
        email,
        phone,
        school || null,
        grade,
        message || null,
        preferredMode || course.mode,
        selectedDay,
        selectedTime,
      ]
    );

    const enrollment = bookingResult.rows[0];

    // ── Send email notification to tutor ──────────────────────────────────
    try {
      // Get course info and tutor email/name from tutor_profiles table
      const courseResult = await pool.query(
        `SELECT c.title, c.tutor_id, tp.email AS tutor_email, tp.full_name AS tutor_name
         FROM courses c
         LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
         WHERE c.id = $1`,
        [classId]
      );

      if (courseResult.rows.length > 0) {
        const { title, tutor_email, tutor_name } = courseResult.rows[0];

        if (tutor_email) {
          // Build HTML email using template
          const html = enrollmentEmailTemplate({
            tutorName:      tutor_name      || 'Tutor',
            studentName:    fullName,
            courseName:     title,
            selectedDay,
            selectedTime,
            preferredMode:  preferredMode   || 'online',
            studentMessage: message         || null,
          });

          // Send using sendEmail helper
          await sendEmail({
            email:   tutor_email,
            subject: `📚 New Enrollment Request — ${title}`,
            message: 'You have a new enrollment request on Mentora.lk', // plain text fallback
            html,
          });

          console.log(`✅ Enrollment email sent to: ${tutor_email}`);
        } else {
          console.warn(`⚠️ Tutor email not found for course: ${classId}`);
        }
      }
    } catch (emailErr) {
      // Email failure does NOT fail the enrollment transaction
      console.warn('⚠️ Email notification failed:', emailErr.message);
    }

    res.status(201).json({
      message: 'Enrollment request submitted successfully',
      enrollment,
    });
  } catch (err) {
    next(err);
  }
};

//! GET /api/enrollments/mine
const getMyEnrollments = async (req, res, next) => {
  try {
    const { status } = req.query;
    let where = ['e.student_id = $1'];
    let params = [req.user.id];

    if (status && status !== 'all') {
      if (status === 'pending' || status === 'requested') {
        where.push(`e.status IN ('pending', 'requested')`);
      } else {
        where.push(`e.status = $2`);
        params.push(status);
      }
    }

    const result = await pool.query(
      `SELECT 
        e.*,
        c.title,
        c.subject,
        c.mode,
        c.location,
        c.fee,
        c.image,
        c.average_rating,
        c.max_students,
        c.schedule,
        c.badge,
        tp.full_name AS tutor_name,
        tp.id   AS tutor_id,
        tp.profile_picture_url AS tutor_avatar
       FROM enrollments e
       LEFT JOIN courses c ON e.class_id = c.id
       LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY e."createdAt" DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

//! GET /api/enrollments/schedule
const getMySchedule = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.id          AS enrollment_id,
        e.selected_day,
        e.selected_time,
        e.preferred_mode,
        e.status,
        c.id          AS course_id,
        c.title,
        c.subject,
        c.schedule,
        c.mode,
        c.location,
        tp.full_name  AS tutor_name
       FROM enrollments e
       JOIN courses c ON e.class_id = c.id
       LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
       WHERE e.student_id = $1
         AND e.status IN ('approved', 'active')`,
      [req.user.id]
    );

    // Shape for schedule page
    const sessions = result.rows.map(row => ({
      enrollmentId: row.enrollment_id,
      courseId: row.course_id,
      title: row.title,
      subject: row.subject,
      tutor: row.tutor_name,
      mode: row.preferred_mode || row.mode,
      location: row.location,
      selectedDay: row.selected_day,
      selectedTime: row.selected_time,
      schedule: row.schedule,
    }));

    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

//! PATCH /api/enrollments/:id
const updateEnrollmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const validStatuses = ['approved', 'rejected', 'active', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const updateResult = await pool.query(
      `UPDATE enrollments
       SET status = $1, "updatedAt" = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    const enrollment = updateResult.rows[0];

    // ── Notify the student when a tutor makes a decision ──────────────────
    if (status === 'approved' || status === 'rejected') {
      try {
        const courseResult = await pool.query(
          `SELECT c.title, tp.full_name AS tutor_name
           FROM courses c
           LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
           WHERE c.id = $1`,
          [enrollment.class_id]
        );

        if (courseResult.rows.length > 0 && enrollment.email) {
          const { title, tutor_name } = courseResult.rows[0];

          const html = enrollmentStatusEmailTemplate({
            studentName: enrollment.full_name,
            courseName: title,
            tutorName: tutor_name,
            status,
            selectedDay: enrollment.selected_day,
            selectedTime: enrollment.selected_time,
          });

          await sendEmail({
            email: enrollment.email,
            subject: status === 'approved'
              ? `🎉 You're in! Enrollment approved — ${title}`
              : `Update on your enrollment — ${title}`,
            message: `Your enrollment for ${title} has been ${status}.`,
            html,
          });

          console.log(`✅ Enrollment status email sent to: ${enrollment.email}`);
        }
      } catch (emailErr) {
        // Email failure does NOT fail the status update
        console.warn('⚠️ Enrollment status email failed:', emailErr.message);
      }
    }

    // ── Push a live update to the student's dashboard ──────────────────────
    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${enrollment.student_id}`).emit('enrollment_status_updated', enrollment);
    }

    res.json({
      message: `Enrollment ${status}`,
      enrollment,
    });
  } catch (err) {
    next(err);
  }
};

//! DELETE /api/enrollments/:id
const deleteEnrollment = async (req, res, next) => {
  try {
    // Use authenticated user's ID
    const studentId = req.user.id;

    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const enrollment = existingResult.rows[0];

    if (enrollment.student_id !== studentId) {
      return res.status(403).json({ message: 'Not your enrollment' });
    }

    await pool.query(
      'DELETE FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Enrollment removed' });
  } catch (err) {
    next(err);
  }
};

//! GET /api/enrollments/:id
const getEnrollmentById = async (req, res, next) => {
  try {
    const enrollment = await fetchEnrollmentWithCourse(req.params.id);

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    if (enrollment.student_id !== req.user.id) {
      return res.status(403).json({ message: 'Not your enrollment' });
    }

    res.json(enrollment);
  } catch (err) {
    next(err);
  }
};

//! PUT /api/enrollments/:id — edit content fields (not status) while still 'requested'
const updateEnrollmentDetails = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const {
      fullName,
      email,
      phone,
      school,
      grade,
      message,
      preferredMode,
      selectedDay,
      selectedTime,
    } = req.body;

    const validationError = validateEnrollmentFields({ fullName, email, phone, grade, selectedDay, selectedTime });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const enrollment = existingResult.rows[0];

    if (enrollment.student_id !== studentId) {
      return res.status(403).json({ message: 'Not your enrollment' });
    }

    if (enrollment.status !== 'requested') {
      return res.status(400).json({ message: 'This enrollment can no longer be edited' });
    }

    // status re-checked in the WHERE clause to guard against a tutor acting
    // on the enrollment between the check above and this write
    const updateResult = await pool.query(
      `UPDATE enrollments
       SET full_name = $1, email = $2, phone = $3, school = $4, grade = $5, message = $6,
           preferred_mode = $7, selected_day = $8, selected_time = $9, "updatedAt" = NOW()
       WHERE id = $10 AND student_id = $11 AND status = 'requested'
       RETURNING id`,
      [
        fullName,
        email,
        phone,
        school || null,
        grade,
        message || null,
        preferredMode || enrollment.preferred_mode,
        selectedDay,
        selectedTime,
        id,
        studentId,
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ message: 'Enrollment status changed, please refresh and try again' });
    }

    const updatedEnrollment = await fetchEnrollmentWithCourse(id);

    res.json({
      message: 'Enrollment updated successfully',
      enrollment: updatedEnrollment,
    });
  } catch (err) {
    next(err);
  }
};

const testEnrollmentEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Recipient email is required in the request body' });
    }

    const html = enrollmentEmailTemplate({
      tutorName:      'Test Tutor',
      studentName:    'John Doe (Postman Test)',
      courseName:     'Advanced Mathematics',
      selectedDay:    'Monday',
      selectedTime:   '10:00 AM',
      preferredMode:  'online',
      studentMessage: 'Hello, this is a test enrollment request sent via Postman.',
    });

    await sendEmail({
      email:   email,
      subject: '📚 [TEST] New Enrollment Request — Advanced Mathematics',
      message: 'You have a new test enrollment request on Mentora.lk',
      html,
    });

    res.status(200).json({
      success: true,
      message: `Test email successfully sent to ${email}`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Email sending failed',
      error: err.message,
    });
  }
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getMySchedule,
  getEnrollmentById,
  updateEnrollmentStatus,
  updateEnrollmentDetails,
  deleteEnrollment,
  testEnrollmentEmail,
};