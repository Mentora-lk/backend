const { pool } = require('../config/db');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

function validateProfileFields({ name, phone }) {
  if (!name || !name.trim()) {
    return 'Full name is required';
  }
  if (name.trim().length > 100) {
    return 'Full name is too long';
  }

  if (phone) {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return 'Please provide a valid phone number';
    }
  }

  return null;
}

// GET /api/students/profile
// Mirrors tutorController.getProfile — real name/contact/academic info plus
// real teaching... err, learning stats, replacing what used to be a fully
// hardcoded form + fake stat cards on the frontend (fake name, fake index
// number, fake "5 classes / 25 sessions / 4.8★" stats shown for every student).
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT
        u.email,
        u.role,
        COALESCE(sp.full_name, '') as name,
        COALESCE(sp.phone, '') as phone,
        COALESCE(sp.school_institute, '') as school,
        COALESCE(sp.grade_level, '') as grade,
        COALESCE(sp.bio, '') as bio,
        COALESCE(sp.address, '') as address,
        sp.profile_picture_url as "profilePicture"
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = result.rows[0];

    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM enrollments WHERE student_id = $1)::int AS "classesEnrolled",
        (SELECT COUNT(*) FROM enrollments WHERE student_id = $1 AND status = 'active')::int AS "activeClasses",
        (SELECT COUNT(*) FROM enrollments WHERE student_id = $1 AND status = 'requested')::int AS "pendingApprovals",
        (SELECT COALESCE(SUM(sessions_attended), 0) FROM enrollments WHERE student_id = $1)::int AS "sessionsAttended",
        (SELECT COUNT(DISTINCT c.subject) FROM enrollments e JOIN courses c ON e.class_id = c.id
          WHERE e.student_id = $1 AND e.status IN ('active', 'approved'))::int AS "subjectsStudying",
        (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE student_id = $1)::float AS "avgRatingGiven"
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      name: profile.name || '',
      email: profile.email,
      phone: profile.phone || '',
      school: profile.school || '',
      grade: profile.grade || '',
      bio: profile.bio || '',
      address: profile.address || '',
      profilePicture: profile.profilePicture || null,
      stats: {
        classesEnrolled: stats.classesEnrolled,
        activeClasses: stats.activeClasses,
        pendingApprovals: stats.pendingApprovals,
        sessionsAttended: stats.sessionsAttended,
        subjectsStudying: stats.subjectsStudying,
        avgRatingGiven: Number(stats.avgRatingGiven) || 0,
      },
    });
  } catch (err) {
    console.error('Error in student getProfile:', err);
    next(err);
  }
};

// PUT /api/students/profile
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, school, grade, bio, address } = req.body;

    const validationError = validateProfileFields({ name, phone });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    let profilePictureUrl = null;
    if (req.file) {
      try {
        profilePictureUrl = await uploadToCloudinary(req.file.buffer, 'mentora/profiles');
      } catch (uploadErr) {
        console.warn('[student updateProfile] Profile picture upload failed:', uploadErr.message);
      }
    }

    const checkProfile = await pool.query('SELECT user_id FROM student_profiles WHERE user_id = $1', [userId]);

    if (checkProfile.rows.length > 0) {
      await pool.query(`
        UPDATE student_profiles
        SET full_name = $1, phone = $2, school_institute = $3, grade_level = $4, bio = $5, address = $6,
            profile_picture_url = COALESCE($7, profile_picture_url)
        WHERE user_id = $8
      `, [name, phone, school, grade, bio, address, profilePictureUrl, userId]);
    } else {
      await pool.query(`
        INSERT INTO student_profiles (user_id, full_name, phone, school_institute, grade_level, bio, address, profile_picture_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [userId, name, phone, school, grade, bio, address, profilePictureUrl]);
    }

    res.json({ message: 'Profile updated successfully', profilePicture: profilePictureUrl });
  } catch (err) {
    console.error('Error in student updateProfile:', err);
    next(err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
