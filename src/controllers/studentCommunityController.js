const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/discover
// Returns communities the student has NOT joined, with optional ?tag= filter.
// ─────────────────────────────────────────────────────────────────────────────
const discoverCommunities = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { tag } = req.query;

    // Base query: exclude communities where the student has an active membership
    // request (pending or approved). A declined request should NOT permanently
    // hide the community — it must reappear so the student can re-request.
    let query = `
      SELECT
        c.id,
        c.name,
        c.description,
        c.tags,
        c.created_at,
        COALESCE(tp.full_name, 'Unknown') AS tutor_name,
        tp.profile_picture_url AS tutor_avatar,
        (SELECT COUNT(*) FROM community_memberships cm2
         WHERE cm2.community_id = c.id AND cm2.status = 'approved') AS member_count
      FROM communities c
      LEFT JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
      WHERE c.id NOT IN (
        SELECT community_id
        FROM community_memberships
        WHERE student_id = $1 AND status IN ('pending', 'approved')
      )
    `;

    const params = [studentId];

    // Optional tag filter — uses the PostgreSQL array operator @>
    if (tag) {
      params.push(tag);
      query += ` AND c.tags @> ARRAY[$${params.length}]::text[]`;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/student/communities/:id/request
// Creates a membership request with status = 'pending'.
// ─────────────────────────────────────────────────────────────────────────────
const requestCommunityAccess = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const communityId = parseInt(req.params.id, 10);

    // Guard: community must exist
    const communityCheck = await pool.query(
      'SELECT id FROM communities WHERE id = $1',
      [communityId]
    );
    if (communityCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // Guard: block only if there's an ACTIVE (pending/approved) request.
    // A prior declined request should not block a fresh request — remove the
    // stale declined row so the INSERT below can create a clean new one.
    const existing = await pool.query(
      'SELECT id, status FROM community_memberships WHERE community_id = $1 AND student_id = $2',
      [communityId, studentId]
    );
    if (existing.rows.length > 0) {
      const currentStatus = existing.rows[0].status;
      if (currentStatus === 'pending' || currentStatus === 'approved') {
        return res.status(409).json({
          message: `You already have a membership request with status: ${currentStatus}`,
        });
      }
      // currentStatus === 'declined' — clear the stale row before re-requesting
      await pool.query('DELETE FROM community_memberships WHERE id = $1', [existing.rows[0].id]);
    }

    const result = await pool.query(
      `INSERT INTO community_memberships (community_id, student_id, status, requested_at)
       VALUES ($1, $2, 'pending', NOW())
       RETURNING *`,
      [communityId, studentId]
    );

    // Notify the community's tutor in real time (same shape as
    // tutorCommunityController.getPendingRequests) so their "Student
    // Requests" widget updates without a refresh.
    const notifyResult = await pool.query(
      `SELECT cm.id AS membership_id, cm.status, cm.requested_at,
              COALESCE(sp.full_name, 'Unknown') AS student_name,
              c.name AS community_name, c.tutor_id
       FROM community_memberships cm
       JOIN communities c ON cm.community_id = c.id
       LEFT JOIN student_profiles sp ON sp.user_id = cm.student_id
       WHERE cm.id = $1`,
      [result.rows[0].id]
    );
    const requestData = notifyResult.rows[0];
    const io = req.app.locals.io;
    if (io && requestData) {
      io.to(`user:${requestData.tutor_id}`).emit('new_membership_request', requestData);
    }

    res.status(201).json({
      message: 'Request submitted successfully',
      membership: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/student/communities/:id/request
// Cancels (withdraws) the caller's own PENDING membership request.
// Does NOT allow cancelling an already-approved or already-declined membership.
// ─────────────────────────────────────────────────────────────────────────────
const cancelCommunityRequest = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const communityId = parseInt(req.params.id, 10);

    const result = await pool.query(
      `DELETE FROM community_memberships
       WHERE community_id = $1 AND student_id = $2 AND status = 'pending'
       RETURNING id`,
      [communityId, studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No pending request found for this community' });
    }

    res.status(200).json({ message: 'Request cancelled successfully' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/my-requests
// Returns the student's own PENDING membership requests, with community info.
// Needed because discoverCommunities deliberately excludes pending/approved
// communities — without this, a requested community just disappears from the
// UI on refresh with no way to see it's pending or cancel it.
// ─────────────────────────────────────────────────────────────────────────────
const getMyPendingRequests = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const result = await pool.query(
      `SELECT
         cm.id AS membership_id,
         cm.requested_at,
         c.id AS community_id,
         c.name,
         c.description,
         c.tags,
         COALESCE(tp.full_name, 'Unknown') AS tutor_name,
         tp.profile_picture_url AS tutor_avatar
       FROM community_memberships cm
       JOIN communities c ON c.id = cm.community_id
       LEFT JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
       WHERE cm.student_id = $1 AND cm.status = 'pending'
       ORDER BY cm.requested_at DESC`,
      [studentId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/my-classes
// Returns communities where the student's membership is 'approved'.
// ─────────────────────────────────────────────────────────────────────────────
const getMyClasses = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.tags,
         c.created_at,
         COALESCE(tp.full_name, 'Unknown') AS tutor_name,
         tp.profile_picture_url AS tutor_avatar,
         cm.requested_at AS joined_at,
         (SELECT COUNT(*) FROM community_memberships cm2
          WHERE cm2.community_id = c.id AND cm2.status = 'approved') AS member_count
       FROM communities c
       JOIN community_memberships cm ON cm.community_id = c.id
       LEFT JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
       WHERE cm.student_id = $1 AND cm.status = 'approved'
       ORDER BY c.name ASC`,
      [studentId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/stats
// Platform-wide community activity numbers for the Discover sidebar — replaces
// hardcoded filler ("4,850 active students / 156 posts today / 1.2K resources")
// that used to be shown regardless of real activity.
// ─────────────────────────────────────────────────────────────────────────────
const getCommunityStats = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT student_id) FROM community_memberships WHERE status = 'approved')::int AS "activeStudents",
        (SELECT COUNT(*) FROM posts WHERE created_at >= CURRENT_DATE)::int AS "postsToday",
        (SELECT COUNT(*) FROM posts WHERE media_url IS NOT NULL)::int AS "resourcesShared"
    `);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/deadlines
// Returns upcoming deadlines from all approved communities, ordered by due_date.
// ─────────────────────────────────────────────────────────────────────────────
const getMyDeadlines = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const result = await pool.query(
      `SELECT
         d.id,
         d.title,
         d.due_date,
         d.link_url,
         c.id   AS community_id,
         c.name AS community_name
       FROM deadlines d
       JOIN communities c ON c.id = d.community_id
       JOIN community_memberships cm
         ON cm.community_id = d.community_id
        AND cm.student_id  = $1
        AND cm.status      = 'approved'
       WHERE d.due_date >= NOW()
       ORDER BY d.due_date ASC`,
      [studentId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/:id/feed
// Returns posts for a community. Student must be an approved member.
// ─────────────────────────────────────────────────────────────────────────────
const getCommunityFeed = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const communityId = parseInt(req.params.id, 10);

    // Access check — student must be an approved member
    const memberCheck = await pool.query(
      `SELECT id FROM community_memberships
       WHERE community_id = $1 AND student_id = $2 AND status = 'approved'`,
      [communityId, studentId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You are not an approved member of this community' });
    }

    // Fetch posts, pinned ones first, then by newest
    const result = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.content,
         p.media_url,
         p.poll_options,
         p.is_pinned,
         p.created_at,
         p.author_id,
         COALESCE(tp.full_name, sp.full_name, 'Unknown') AS author_name,
         tp.profile_picture_url AS author_avatar,
         CASE WHEN tp.user_id IS NOT NULL THEN 'Tutor' ELSE 'Student' END AS role,
         (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reaction_count,
         EXISTS (
           SELECT 1 FROM post_reactions pr
           WHERE pr.post_id = p.id AND pr.student_id = $1
         ) AS has_reacted
       FROM posts p
       LEFT JOIN tutor_profiles tp ON tp.user_id = p.author_id
       LEFT JOIN student_profiles sp ON sp.user_id = p.author_id
       WHERE p.community_id = $2
       ORDER BY p.is_pinned DESC, p.created_at DESC`,
      [studentId, communityId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/student/posts/:id/react
// Toggles a reaction (like) on a post.
// - If the student HAS already reacted → removes the reaction (unlike)
// - If the student has NOT reacted     → inserts a new reaction (like)
// ─────────────────────────────────────────────────────────────────────────────
const togglePostReaction = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const postId = parseInt(req.params.id, 10);

    // Guard: post must exist
    const postCheck = await pool.query(
      'SELECT id FROM posts WHERE id = $1',
      [postId]
    );
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check for existing reaction
    const existing = await pool.query(
      'SELECT id FROM post_reactions WHERE post_id = $1 AND student_id = $2',
      [postId, studentId]
    );

    let reacted;

    if (existing.rows.length > 0) {
      // Already reacted → remove (toggle off)
      await pool.query(
        'DELETE FROM post_reactions WHERE post_id = $1 AND student_id = $2',
        [postId, studentId]
      );
      reacted = false;
    } else {
      // Not yet reacted → insert (toggle on)
      await pool.query(
        'INSERT INTO post_reactions (post_id, student_id) VALUES ($1, $2)',
        [postId, studentId]
      );
      reacted = true;
    }

    // Return updated reaction count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM post_reactions WHERE post_id = $1',
      [postId]
    );

    res.json({
      reacted,
      reactionCount: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/posts/:id/download
// Returns download URL for material attached to a post.
// Student must be an approved member of the community to download.
// ─────────────────────────────────────────────────────────────────────────────
const downloadMaterial = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const postId = parseInt(req.params.id, 10);

    // Fetch post details with community info
    const postResult = await pool.query(
      `SELECT p.id, p.media_url, p.community_id, p.created_at
       FROM posts p
       WHERE p.id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    const post = postResult.rows[0];

    if (!post.media_url) {
      return res.status(404).json({ status: 'error', message: 'No material attached to this post' });
    }

    // Verify student is an approved member of the community
    const memberCheck = await pool.query(
      `SELECT id FROM community_memberships
       WHERE community_id = $1 AND student_id = $2 AND status = 'approved'`,
      [post.community_id, studentId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'You do not have permission to download this material' 
      });
    }

    // Return the Cloudinary URL for download
    res.status(200).json({ 
      status: 'success', 
      data: { 
        download_url: post.media_url,
        message: 'Click the URL to download the material'
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  discoverCommunities,
  requestCommunityAccess,
  cancelCommunityRequest,
  getMyPendingRequests,
  getMyClasses,
  getMyDeadlines,
  getCommunityStats,
  getCommunityFeed,
  togglePostReaction,
  downloadMaterial,
};
