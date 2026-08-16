const { pool } = require('../config/db');

// schedule is stored as jsonb, e.g. {"Friday": ["5:00 PM","7:00 PM"]} — never render it
// directly as a React child on the frontend, always summarize it into a string first.
const formatScheduleSummary = (schedule) => {
  if (!schedule || typeof schedule !== 'object') return 'TBD';
  const days = Object.keys(schedule);
  if (days.length === 0) return 'TBD';
  const firstDay = days[0];
  const times = Array.isArray(schedule[firstDay]) ? schedule[firstDay] : [];
  const timeStr = times.length > 0 ? times[0] : '';
  const daysStr = days.length > 1 ? `${firstDay} +${days.length - 1} more` : firstDay;
  return timeStr ? `${daysStr}, ${timeStr}` : daysStr;
};

const getDashboardData = async (req, res, next) => {
  try {
    // req.user.id is set by authMiddleware
    const userId = req.user.id;

    // Get tutor's courses with enrolled student count
    const coursesResult = await pool.query(`
      SELECT
        c.id, c.title, c.subject, c.location, c.mode, c.fee,
        c.average_rating as rating, c.status, c.max_students as "totalSlots",
        c.schedule, c.image,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status IN ('active', 'approved'))::int as "studentsEnrolled"
      FROM courses c
      WHERE c.tutor_id = $1
      ORDER BY c."createdAt" DESC
    `, [userId]);

    const classes = coursesResult.rows.map(c => ({
      ...c,
      nextSession: formatScheduleSummary(c.schedule),
    }));

    // Get recent requests
    const requestsResult = await pool.query(`
      SELECT 
        e.id, e.full_name as name, c.subject, e."createdAt"
      FROM enrollments e
      JOIN courses c ON e.class_id = c.id
      WHERE c.tutor_id = $1 AND e.status = 'pending'
      ORDER BY e."createdAt" DESC
      LIMIT 5
    `, [userId]);

    const recentRequests = requestsResult.rows.map(req => {
      // Calculate time ago
      const diffMs = new Date() - new Date(req.createdAt);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeStr = 'just now';
      if (diffDays > 0) timeStr = `${diffDays} days ago`;
      else if (diffHours > 0) timeStr = `${diffHours} hours ago`;
      else if (diffMins > 0) timeStr = `${diffMins} mins ago`;

      const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
      const color = colors[req.id % colors.length];

      return {
        id: req.id,
        name: req.name,
        subject: req.subject,
        time: timeStr,
        avatar: req.name ? req.name.charAt(0).toUpperCase() : 'U',
        color: color
      };
    });

    // Upcoming sessions
    const upcomingSessions = classes
      .filter(c => c.status === 'active' && c.studentsEnrolled > 0)
      .slice(0, 3)
      .map((c, i) => {
        const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
        return {
          id: c.id,
          subject: c.subject,
          students: c.studentsEnrolled,
          time: c.nextSession || 'TBD',
          color: colors[i % colors.length]
        };
      });

    res.json({
      classes,
      recentRequests,
      upcomingSessions
    });

  } catch (err) {
    next(err);
  }
};

const getTutorRequests = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const requestsResult = await pool.query(`
      SELECT 
        e.id, e.full_name as name, c.subject, c.title as class, 
        e."createdAt" as date, e.message, e.status,
        e.email, e.phone, e.school, e.grade, e.preferred_mode,
        e.selected_day, e.selected_time
      FROM enrollments e
      JOIN courses c ON e.class_id = c.id
      WHERE c.tutor_id = $1
      ORDER BY e."createdAt" DESC
    `, [userId]);

    const requests = requestsResult.rows.map(req => {
      // Calculate time ago
      const diffMs = new Date() - new Date(req.date);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeStr = 'just now';
      if (diffDays > 0) timeStr = `${diffDays} days ago`;
      else if (diffHours > 0) timeStr = `${diffHours} hours ago`;
      else if (diffMins > 0) timeStr = `${diffMins} mins ago`;

      const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EC4899'];
      const color = colors[req.id % colors.length];

      return {
        id: req.id,
        name: req.name,
        subject: req.subject,
        class: req.class,
        date: new Date(req.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: timeStr,
        message: req.message || 'I would like to join this class.',
        status: req.status === 'requested' ? 'pending' : req.status, // Map 'requested' to 'pending' for UI
        avatar: req.name ? req.name.charAt(0).toUpperCase() : 'U',
        color: color,
        // Added details
        email: req.email,
        phone: req.phone,
        school: req.school,
        grade: req.grade,
        preferredMode: req.preferred_mode,
        selectedDay: req.selected_day,
        selectedTime: req.selected_time
      };
    });

    res.json(requests);

  } catch (err) {
    next(err);
  }
};

const getAllTutors = (req, res) => {
  res.json({ message: 'Get all tutors' });
};


// Get tutor profile data
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch profile data joining users and tutor_profiles (using LEFT JOIN in case profile doesn't exist yet)
    const result = await pool.query(`
      SELECT
        u.email,
        u.role,
        COALESCE(tp.full_name, '') as name,
        COALESCE(tp.city, '') as location,
        COALESCE(tp.experience, '') as experience,
        COALESCE(tp.university, '') as university,
        COALESCE(tp.degree_title, '') as degree,
        COALESCE(tp.description, '') as bio,
        COALESCE(tp.subject, '') as subject,
        COALESCE(tp.phone, '') as phone,
        COALESCE(tp.fee, '') as fee,
        tp.status as verification_status
      FROM users u
      LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = result.rows[0];

    // Real teaching stats for the profile page's summary cards — replaces the
    // hardcoded "5 classes / 60 students / 4.8★" placeholders that used to be
    // shown for every tutor regardless of actual data.
    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM courses WHERE tutor_id = $1)::int AS "classesCount",
        (SELECT COUNT(*) FROM courses WHERE tutor_id = $1 AND status = 'active')::int AS "activeClassesCount",
        (SELECT COALESCE(AVG(average_rating), 0) FROM courses WHERE tutor_id = $1 AND status = 'active')::float AS "avgRating",
        (SELECT COUNT(*) FROM enrollments e JOIN courses c ON e.class_id = c.id
          WHERE c.tutor_id = $1 AND e.status IN ('active', 'approved'))::int AS "totalStudents",
        (SELECT COUNT(*) FROM enrollments e JOIN courses c ON e.class_id = c.id
          WHERE c.tutor_id = $1 AND e.status = 'requested')::int AS "pendingRequests"
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      name: profile.name || '',
      email: profile.email,
      phone: profile.phone || '',
      subject: profile.subject || '',
      location: profile.location || '',
      experience: profile.experience || '',
      education: profile.university || '',
      bio: profile.bio || '',
      fee: profile.fee || '',
      verified: profile.verification_status === 'active',
      stats: {
        classesCount: stats.classesCount,
        activeClassesCount: stats.activeClassesCount,
        avgRating: Number(stats.avgRating) || 0,
        totalStudents: stats.totalStudents,
        pendingRequests: stats.pendingRequests,
      },
    });
  } catch (err) {
    console.error('Error in getProfile:', err);
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, subject, location, experience, education, bio, fee } = req.body;

    // Check if profile exists
    const checkProfile = await pool.query('SELECT id FROM tutor_profiles WHERE user_id = $1', [userId]);

    if (checkProfile.rows.length > 0) {
      // Update existing
      await pool.query(`
        UPDATE tutor_profiles 
        SET 
          full_name = $1,
          city = $2,
          experience = $3,
          description = $4,
          subject = $5,
          phone = $6,
          fee = $7,
          university = $8
        WHERE user_id = $9
      `, [name, location, experience, bio, subject, phone, fee, education, userId]);
    } else {
      // Create new
      await pool.query(`
        INSERT INTO tutor_profiles (user_id, full_name, city, experience, description, subject, phone, fee, university)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, name, location, experience, bio, subject, phone, fee, education]);
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Error in updateProfile:', err);
    next(err);
  }
};

module.exports = {
  getAllTutors,
  getDashboardData,
  getTutorRequests,
  getProfile,
  updateProfile
};

