const { pool } = require('../config/db');

const getDashboardData = async (req, res, next) => {
  try {
    // req.user.id is set by authMiddleware
    const userId = req.user.id;

    // Get tutor's courses with enrolled student count
    const coursesResult = await pool.query(`
      SELECT 
        c.id, c.title, c.subject, c.location, c.mode, c.fee, 
        c.average_rating as rating, c.status, c.max_students as "totalSlots", 
        c.schedule as "nextSession", c.image,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status IN ('active', 'approved'))::int as "studentsEnrolled"
      FROM courses c
      WHERE c.tutor_id = $1
      ORDER BY c."createdAt" DESC
    `, [userId]);

    const classes = coursesResult.rows;

    // Get recent requests
    const requestsResult = await pool.query(`
      SELECT 
        e.id, e.full_name as name, c.subject, e."createdAt"
      FROM enrollments e
      JOIN courses c ON e.class_id = c.id
      WHERE c.tutor_id = $1 AND e.status = 'requested'
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
        e."createdAt" as date, e.message, e.status
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
        color: color
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

module.exports = {
  getAllTutors,
  getDashboardData,
  getTutorRequests
};
