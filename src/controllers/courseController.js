const { pool } = require('../config/db');

//! GET /api/courses
const getCourses = async (req, res, next) => {
  try {
    const {
      subject, mode, location,
      minRating = 0, maxFee = 99999,
      sortBy = 'rating', page = 1, limit = 6,
      q = '',
    } = req.query;

    const minRatingNum = Number(minRating);
    const maxFeeNum = Number(maxFee);
    const pageNum = Number(page);
    const limitNum = Number(limit);

    let where = [];
    let params = [];
    let index = 1;

    if (q) {
      where.push(`c.title ILIKE $${index++}`);
      params.push(`%${q}%`);
    }

    if (subject) {
      where.push(`c.subject = $${index++}`);
      params.push(subject);
    }

    if (mode) {
      where.push(`c.mode = $${index++}`);
      params.push(mode);
    }

    if (location) {
      where.push(`c.location = $${index++}`);
      params.push(location);
    }

    if (minRatingNum > 0) {
      where.push(`c.average_rating >= $${index++}`);
      params.push(minRatingNum);
    }

    if (maxFeeNum < 99999) {
      where.push(`c.fee <= $${index++}`);
      params.push(maxFeeNum);
    }

    where.push(`c.status = $${index++}`);
    params.push('active');

    if (where.length === 0) {
      where.push("1=1");
    }

    const orderMap = {
      rating: 'average_rating DESC',
      fee_asc: 'fee ASC',
      fee_desc: 'fee DESC',
      reviews: 'review_count DESC',
    };

    const orderBy = orderMap[sortBy] || orderMap.rating;
    const offset = (pageNum - 1) * limitNum;

    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM courses c WHERE ${where.join(' AND ')}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    // Courses with tutor info
    const coursesResult = await pool.query(
  `SELECT 
    c.*,
    tp.full_name           AS tutor_name,
    tp.profile_picture_url AS tutor_avatar
   FROM courses c
   LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.id
   WHERE ${where.join(' AND ')}
   ORDER BY ${orderBy}
   LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
  [...params, limit, offset]
);

    const courses = coursesResult.rows.map(row => ({
      ...row,
      tutor_name:   row.tutor_name,
      tutor_avatar: row.tutor_avatar,
      tutor: {
        name:   row.tutor_name,
        avatar: row.tutor_avatar,
      },
    }));

    res.json({
      courses,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (err) {
    next(err);
  }
};

//! GET /api/courses/:id
const getCourseById = async (req, res, next) => {
  try {
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [req.params.id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = courseResult.rows[0];

    const tutorResult = await pool.query(
      'SELECT * FROM tutor_profiles WHERE id = $1',
      [course.tutor_id]
    );

    const tutor = tutorResult.rows[0] || null;

    const enrolledResult = await pool.query(
      `SELECT COUNT(*) FROM enrollments 
       WHERE class_id = $1 AND status IN ('approved','active')`,
      [course.id]
    );

    res.json({
      id:             course.id,
      tutor_id:       course.tutor_id,
      title:          course.title,
      subject:        course.subject,
      description:    course.description,
      fee:            course.fee,
      mode:           course.mode,
      location:       course.location,
      schedule:       course.schedule,
      what_you_learn: course.what_you_learn,
      max_students:   course.max_students,
      status:         course.status,
      average_rating: course.average_rating,
      review_count:   course.review_count,
      badge:          course.badge,
      image:          course.image,
      enrolledCount:  parseInt(enrolledResult.rows[0].count),
      tutor_name:           tutor?.full_name           || 'Unknown Tutor',
      tutor_avatar:         tutor?.profile_picture_url || null,
      tutor_bio:            tutor?.description         || '',
      tutor_qualifications: tutor?.degree_title        || '',
      tutor_university:     tutor?.university          || '',
      tutor_experience:     tutor?.experience          || '',
      tutor_medium:         tutor?.medium              || '',
      tutor_subjects:       tutor?.subjects            || [],
      tutor_city:           tutor?.city                || '',
      tutor_is_verified:    tutor?.status === 'active',
      tutor_average_rating: Number(course.average_rating) || 0,
      tutor_total_students: 0,
    });
  } catch (err) {
    console.error('getCourseById error:', err.message);
    next(err);
  }
};

//! GET reviews
const getCourseReviews = async (req, res, next) => {
  try {
    // First get the tutor_id for this course
    const courseResult = await pool.query(
      'SELECT tutor_id FROM courses WHERE id = $1',
      [req.params.id]
    );

    if (courseResult.rows.length === 0) {
      return res.json([]);
    }

    const tutorId = courseResult.rows[0].tutor_id;

    // Get reviews for this tutor
    const result = await pool.query(
      `SELECT 
        r.*,
        sp.full_name AS student_name
       FROM reviews r
       LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
       WHERE r.tutor_id = $1
       ORDER BY r."createdAt" DESC`,
      [tutorId]
    );

    const reviews = result.rows.map(r => ({
      ...r,
      student: { name: r.student_name || 'Student' },
    }));

    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

//! POST review
const addReview = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const courseId = Number(req.params.id);

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be 1-5' });
    }

    // Get tutor_id from course
    const courseResult = await pool.query(
      'SELECT tutor_id FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const tutorId = courseResult.rows[0].tutor_id;

    const exists = await pool.query(
      'SELECT * FROM enrollments WHERE student_id = $1 AND class_id = $2 AND status IN ($3,$4)',
      [req.user.id, courseId, 'approved', 'active']
    );

    if (exists.rows.length === 0) {
      return res.status(403).json({ message: 'Must be enrolled' });
    }

    const inserted = await pool.query(
      `INSERT INTO reviews (student_id, tutor_id, rating, comment, "createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,
      [req.user.id, tutorId, rating, comment]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
};

//! GET /api/stats — platform statistics for landing page hero
const getPlatformStats = async (req, res, next) => {
  try {
    const [tutors, students, subjects] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM tutor_profiles`),
      pool.query(`SELECT COUNT(DISTINCT student_id) FROM enrollments WHERE status IN ('active','approved')`),
      pool.query(`SELECT COUNT(DISTINCT subject) FROM courses WHERE status = 'active'`),
    ]);

    res.json({
      activeTutors:     parseInt(tutors.rows[0].count),
      studentsEnrolled: parseInt(students.rows[0].count),
      subjectsAvailable: parseInt(subjects.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCourses,
  getCourseById,
  getCourseReviews,
  addReview,
  getPlatformStats,
};