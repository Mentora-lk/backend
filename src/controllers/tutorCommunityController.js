const db = require('../config/db');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// 1. Community Management

exports.getCommunityById = async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(parseInt(id))) {
            return res.status(404).json({ status: 'error', message: 'Community not found' });
        }
        const result = await db.query(
            `SELECT c.id, c.name, c.description, c.tags, c.created_at,
             (SELECT COUNT(*) FROM community_memberships cm WHERE cm.community_id = c.id AND cm.status = 'approved') as members_count
             FROM communities c WHERE c.id = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Community not found' });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching community by id:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCommunityPosts = async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(parseInt(id))) {
            return res.status(404).json({ status: 'error', message: 'Community not found' });
        }
        const result = await db.query(
            `SELECT p.id, p.type, p.content, p.media_url, p.poll_options, p.is_pinned, p.created_at,
             COALESCE(sp.full_name, tp.full_name, 'Unknown User') as author_name, u.role as author_role
             FROM posts p
             JOIN users u ON p.author_id = u.id
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
             WHERE p.community_id = $1
             ORDER BY p.is_pinned DESC, p.created_at DESC`,
            [id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Error fetching community posts:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCommunityMembers = async (req, res) => {
    try {
        const { id } = req.params;
        if (isNaN(parseInt(id))) {
            return res.status(404).json({ status: 'error', message: 'Community not found' });
        }
        // Also fetch the tutor's info as they are technically the admin
        const tutorResult = await db.query(
            `SELECT u.id, tp.full_name as name, u.role, c.created_at as joined_at
             FROM communities c
             JOIN users u ON c.tutor_id = u.id
             LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
             WHERE c.id = $1`,
            [id]
        );
        
        const membersResult = await db.query(
            `SELECT u.id, sp.full_name as name, u.role, cm.requested_at as joined_at
             FROM community_memberships cm
             JOIN users u ON cm.student_id = u.id
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             WHERE cm.community_id = $1 AND cm.status = 'approved'`,
            [id]
        );
        
        // Combine tutor and students
        const allMembers = [];
        if (tutorResult.rows.length > 0) {
            allMembers.push({ ...tutorResult.rows[0], role: 'Admin' });
        }
        
        const students = membersResult.rows.map(m => ({ ...m, role: 'Student' }));
        allMembers.push(...students);
        
        res.status(200).json({ status: 'success', data: allMembers });
    } catch (error) {
        console.error('Error fetching community members:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCommunities = async (req, res) => {
    try {
        const tutorId = req.user.id;
        
        const communitiesResult = await db.query(
            'SELECT id, name, description, tags, created_at FROM communities WHERE tutor_id = $1',
            [tutorId]
        );
        const communities = communitiesResult.rows;

        const statsResult = await db.query(
            `SELECT 
                (SELECT COUNT(*) FROM community_memberships cm 
                 JOIN communities c ON cm.community_id = c.id 
                 WHERE c.tutor_id = $1 AND cm.status = 'approved') as total_students,
                (SELECT COUNT(*) FROM posts p 
                 JOIN communities c ON p.community_id = c.id 
                 WHERE c.tutor_id = $1) as total_resources`,
            [tutorId]
        );
        const stats = {
            total_students: parseInt(statsResult.rows[0].total_students || 0),
            total_resources: parseInt(statsResult.rows[0].total_resources || 0)
        };

        res.status(200).json({
            status: 'success',
            data: { communities, stats }
        });
    } catch (error) {
        console.error('Error fetching communities:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createCommunity = async (req, res) => {
    try {
        const tutorId = req.user.id;
        const { name, description, tags } = req.body;
        
        const result = await db.query(
            'INSERT INTO communities (tutor_id, name, description, tags, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [tutorId, name, description, tags]
        );
        
        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Error creating community:', error);
        res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
    }
};

// 2. Request Management

exports.getPendingRequests = async (req, res) => {
    try {
        const tutorId = req.user.id;
        
        const result = await db.query(
            `SELECT cm.id as membership_id, cm.status, cm.requested_at, sp.full_name as student_name, c.name as community_name 
             FROM community_memberships cm
             JOIN users u ON cm.student_id = u.id
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             JOIN communities c ON cm.community_id = c.id
             WHERE c.tutor_id = $1 AND cm.status = 'pending'`,
            [tutorId]
        );
        
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.updateRequestStatus = async (req, res) => {
    try {
        const { membership_id } = req.params;
        const { status } = req.body; // 'approved' or 'declined'
        
        if (!['approved', 'declined'].includes(status)) {
            return res.status(400).json({ status: 'error', message: 'Invalid status. Must be "approved" or "declined".' });
        }
        
        const result = await db.query(
            'UPDATE community_memberships SET status = $1 WHERE id = $2 RETURNING *',
            [status, membership_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Membership request not found' });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 3. Content Publishing (WITH SOCKET.IO INTEGRATION)

exports.createPost = async (req, res) => {
    try {
        const tutorId = req.user.id;
        const { id: community_id } = req.params;
        let { type, content, is_pinned, poll_options } = req.body;
        let media_url = null;
        let pollOptionsJson = null;

        // Debug logs
        console.log('🔧 DEBUG: createPost called');
        console.log('  community_id:', community_id);
        console.log('  tutorId:', tutorId);
        console.log('  req.body keys:', Object.keys(req.body));
        console.log('  has file?', !!req.file);
        console.log('  req.file info:', req.file ? { fieldname: req.file.fieldname, originalname: req.file.originalname, size: req.file.size } : 'none');
        console.log('  Poll options string:', poll_options);

        // Validate and set type - only allow valid values
        const validTypes = ['announcement', 'poll', 'document'];
        if (!type || !validTypes.includes(type)) {
            type = 'announcement'; // Default to announcement
            console.log('⚠️  Type not provided or invalid, using default: announcement');
        }

        if (!content) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Content is required'
            });
        }

        // Handle file upload if material is attached
        if (req.file) {
            try {
                console.log('🔄 Uploading to Cloudinary...');
                media_url = await uploadToCloudinary(req.file.buffer, 'tutor_community_materials', req.file.originalname);
                console.log('✅ Upload successful:', media_url);
            } catch (uploadError) {
                console.error('❌ Error uploading to Cloudinary:', uploadError);
                return res.status(500).json({ 
                    status: 'error', 
                    message: 'Failed to upload material',
                    details: uploadError.message 
                });
            }
        }

        // Parse poll options if provided
        if (poll_options) {
            try {
                console.log('📊 Parsing poll options:', poll_options);
                pollOptionsJson = typeof poll_options === 'string' ? JSON.parse(poll_options) : poll_options;
                console.log('✅ Poll options parsed:', pollOptionsJson);
            } catch (e) {
                console.error('❌ Error parsing poll options:', e);
                pollOptionsJson = null;
            }
        }
        
        console.log('💾 Inserting into database...');
        const result = await db.query(
            `INSERT INTO posts (community_id, author_id, type, content, media_url, poll_options, is_pinned, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [community_id, tutorId, type, content, media_url, pollOptionsJson ? JSON.stringify(pollOptionsJson) : null, is_pinned || false]
        );
        
        const newPostData = result.rows[0];
        console.log('✅ Post created with ID:', newPostData.id);
        
        const io = req.app.get('io');
        if (io) {
            io.to(community_id.toString()).emit('new_community_post', newPostData);
        }
        
        res.status(201).json({ status: 'success', data: newPostData });
    } catch (error) {
        console.error('❌ Error creating post:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.pinPost = async (req, res) => {
    try {
        const { id: post_id } = req.params;
        const { is_pinned } = req.body;
        
        const result = await db.query(
            'UPDATE posts SET is_pinned = $1 WHERE id = $2 RETURNING *',
            [is_pinned, post_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Post not found' });
        }
        
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Error pinning post:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.createDeadline = async (req, res) => {
    try {
        const { id: community_id } = req.params;
        const { title, due_date, link_url } = req.body;
        
        const result = await db.query(
            'INSERT INTO deadlines (community_id, title, due_date, link_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [community_id, title, due_date, link_url]
        );
        
        const newDeadlineData = result.rows[0];
        
        const io = req.app.get('io');
        if (io) {
            io.to(community_id.toString()).emit('new_deadline', newDeadlineData);
        }
        
        res.status(201).json({ status: 'success', data: newDeadlineData });
    } catch (error) {
        console.error('Error creating deadline:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};

// 4. Download Material
exports.downloadMaterial = async (req, res) => {
    try {
        const { id: post_id } = req.params;
        const userId = req.user.id;
        
        // Fetch post details
        const postResult = await db.query(
            `SELECT p.id, p.media_url, p.community_id, c.tutor_id
             FROM posts p
             JOIN communities c ON p.community_id = c.id
             WHERE p.id = $1`,
            [post_id]
        );
        
        if (postResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Post not found' });
        }
        
        const post = postResult.rows[0];
        
        if (!post.media_url) {
            return res.status(404).json({ status: 'error', message: 'No material attached to this post' });
        }
        
        // Verify user is either the tutor or an approved student member
        const memberResult = await db.query(
            `SELECT cm.status FROM community_memberships cm
             WHERE cm.community_id = $1 AND cm.student_id = $2 AND cm.status = 'approved'`,
            [post.community_id, userId]
        );
        
        const isTutor = post.tutor_id === userId;
        const isApprovedMember = memberResult.rows.length > 0;
        
        if (!isTutor && !isApprovedMember) {
            return res.status(403).json({ 
                status: 'error', 
                message: 'You do not have permission to download this material' 
            });
        }
        
        // Redirect to Cloudinary URL for download
        res.status(200).json({ 
            status: 'success', 
            data: { 
                download_url: post.media_url,
                message: 'Click the URL to download the material'
            }
        });
    } catch (error) {
        console.error('Error downloading material:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};
