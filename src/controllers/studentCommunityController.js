const { pool } = require('../config/db');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/communities/discover
// Returns communities the student has NOT joined, with optional ?tag= filter.
// ─────────────────────────────────────────────────────────────────────────────
const discoverCommunities = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { tag } = req.query;

    // Base query: exclude communities where the student already has a membership
    // (regardless of status — pending, approved, or declined still appears once)
    let query = `
      SELECT
        c.id,
        c.name,
        c.description,
        c.tags,
        c.created_at,
        tp.full_name  AS tutor_name,
        tp.profile_picture_url AS tutor_avatar,
        (SELECT COUNT(*) FROM community_memberships cm2
         WHERE cm2.community_id = c.id AND cm2.status = 'approved') AS member_count
      FROM communities c
      JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
      WHERE c.id NOT IN (
        SELECT community_id
        FROM community_memberships
        WHERE student_id = $1
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

    // Guard: no duplicate request
    const existing = await pool.query(
      'SELECT id, status FROM community_memberships WHERE community_id = $1 AND student_id = $2',
      [communityId, studentId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: `You already have a membership request with status: ${existing.rows[0].status}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO community_memberships (community_id, student_id, status, requested_at)
       VALUES ($1, $2, 'pending', NOW())
       RETURNING *`,
      [communityId, studentId]
    );

    res.status(201).json({
      message: 'Request submitted successfully',
      membership: result.rows[0],
    });
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
         tp.full_name  AS tutor_name,
         tp.profile_picture_url AS tutor_avatar,
         cm.requested_at AS joined_at,
         (SELECT COUNT(*) FROM community_memberships cm2
          WHERE cm2.community_id = c.id AND cm2.status = 'approved') AS member_count
       FROM communities c
       JOIN community_memberships cm ON cm.community_id = c.id
       JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
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
         c.name AS community_name,
         ds.file_url,
         ds.submitted_at,
         CASE WHEN ds.id IS NOT NULL THEN true ELSE false END AS is_submitted
       FROM deadlines d
       JOIN communities c ON c.id = d.community_id
       JOIN community_memberships cm
         ON cm.community_id = d.community_id
        AND cm.student_id  = $1
        AND cm.status      = 'approved'
       LEFT JOIN deadline_submissions ds
         ON ds.deadline_id = d.id
        AND ds.student_id = $1
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
         p.is_pinned,
         p.created_at,
         p.author_id,
         COALESCE(tp.full_name, sp.full_name, 'Unknown') AS author_name,
         tp.profile_picture_url AS author_avatar,
         CASE WHEN tp.user_id IS NOT NULL THEN 'Tutor' ELSE 'Student' END AS role,
         (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reaction_count,
         (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
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
// GET /api/student/communities/my-requests
// Returns communities where the student's membership is 'pending' or 'declined'.
// ─────────────────────────────────────────────────────────────────────────────
const getMyRequests = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.tags,
         tp.full_name  AS tutor_name,
         tp.profile_picture_url AS tutor_avatar,
         cm.status,
         cm.requested_at
       FROM communities c
       JOIN community_memberships cm ON cm.community_id = c.id
       JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
       WHERE cm.student_id = $1 AND cm.status IN ('pending', 'declined')
       ORDER BY cm.requested_at DESC`,
      [studentId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/student/communities/:id/request
// Cancels a pending membership request.
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
      return res.status(404).json({ message: 'No pending request found for this community.' });
    }

    res.json({ message: 'Request cancelled successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/student/communities/:id/request/declined
// Dismisses (removes) a declined membership record.
// ─────────────────────────────────────────────────────────────────────────────
const dismissDeclinedRequest = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const communityId = parseInt(req.params.id, 10);

    const result = await pool.query(
      `DELETE FROM community_memberships
       WHERE community_id = $1 AND student_id = $2 AND status = 'declined'
       RETURNING id`,
      [communityId, studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No declined request found for this community.' });
    }

    res.json({ message: 'Declined request dismissed.' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/posts/:id/comments
// Returns all comments for a post, with author info.
// ─────────────────────────────────────────────────────────────────────────────
const getPostComments = async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const result = await pool.query(
      `SELECT
         pc.id,
         pc.content,
         pc.created_at,
         pc.author_id,
         COALESCE(tp.full_name, sp.full_name, 'Unknown') AS author_name,
         tp.profile_picture_url AS author_avatar,
         CASE WHEN tp.user_id IS NOT NULL THEN 'Tutor' ELSE 'Student' END AS role
       FROM post_comments pc
       LEFT JOIN tutor_profiles tp ON tp.user_id = pc.author_id
       LEFT JOIN student_profiles sp ON sp.user_id = pc.author_id
       WHERE pc.post_id = $1
       ORDER BY pc.created_at ASC`,
      [postId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/student/posts/:id/comments
// Adds a comment to a post.
// ─────────────────────────────────────────────────────────────────────────────
const addPostComment = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const postId   = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required.' });
    }

    // Verify post exists
    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const result = await pool.query(
      `INSERT INTO post_comments (post_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at, author_id`,
      [postId, authorId, content.trim()]
    );

    const comment = result.rows[0];

    // Fetch author info for the response
    const authorInfo = await pool.query(
      `SELECT
         COALESCE(tp.full_name, sp.full_name, 'Unknown') AS author_name,
         tp.profile_picture_url AS author_avatar,
         CASE WHEN tp.user_id IS NOT NULL THEN 'Tutor' ELSE 'Student' END AS role
       FROM users u
       LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [authorId]
    );

    res.status(201).json({ ...comment, ...authorInfo.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/student/posts/:postId/comments/:commentId
// Deletes a comment — only the comment author may do this.
// ─────────────────────────────────────────────────────────────────────────────
const deletePostComment = async (req, res, next) => {
  try {
    const requesterId = req.user.id;
    const commentId   = parseInt(req.params.commentId, 10);

    const result = await pool.query(
      `DELETE FROM post_comments
       WHERE id = $1 AND author_id = $2
       RETURNING id`,
      [commentId, requesterId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Comment not found or you are not the author.' });
    }

    res.json({ message: 'Comment deleted.', id: commentId });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/student/deadlines/:id/submit
// Submits an assignment file for a deadline
// ─────────────────────────────────────────────────────────────────────────────
const submitAssignment = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const deadlineId = parseInt(req.params.id, 10);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    // Verify deadline exists
    const deadlineCheck = await pool.query('SELECT id FROM deadlines WHERE id = $1', [deadlineId]);
    if (deadlineCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Deadline not found.' });
    }

    // Upload file to Cloudinary
    const fileUrl = await uploadToCloudinary(file.buffer, 'mentora/submissions');

    // Insert or update submission
    const result = await pool.query(
      `INSERT INTO deadline_submissions (deadline_id, student_id, file_url, file_name, submitted_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (deadline_id, student_id) 
       DO UPDATE SET file_url = EXCLUDED.file_url, file_name = EXCLUDED.file_name, submitted_at = NOW()
       RETURNING *`,
      [deadlineId, studentId, fileUrl, file.originalname]
    );

    res.status(201).json({ message: 'Assignment submitted successfully', submission: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  discoverCommunities,
  requestCommunityAccess,
  cancelCommunityRequest,
  dismissDeclinedRequest,
  getMyClasses,
  getMyRequests,
  getMyDeadlines,
  getCommunityFeed,
  togglePostReaction,
  getPostComments,
  addPostComment,
  deletePostComment,
  submitAssignment,
};
