const db = require('../config/db');

// Email addresses are case-insensitive in practice, but every lookup here is a
// plain `WHERE email = $1`. Without normalising, an account stored as
// "Ryan@gmail.com" can't be found by "ryan@gmail.com" — login returns
// "Invalid credentials" despite a correct password, and a password reset
// silently targets nothing. Normalising in the model (rather than in each
// controller) keeps the write and read paths in agreement for every caller,
// including googleAuthService.
const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : email);

const createUserAccount = async (email, passwordHash, role) => {
    const result = await db.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [normalizeEmail(email), passwordHash, role]
    );
    return result.rows[0];
};

const findUserByEmail = async (email) => {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
    return result.rows[0];
};

// Looks up the display name from the role-specific profile table so the
// frontend can show who's actually logged in instead of placeholder text.
// Returns null for roles without a profile table (e.g. admin).
const findFullNameByUser = async (userId, role) => {
    const table = role === 'tutor' ? 'tutor_profiles' : role === 'student' ? 'student_profiles' : null;
    if (!table) return null;

    const result = await db.query(`SELECT full_name FROM ${table} WHERE user_id = $1`, [userId]);
    return result.rows[0]?.full_name || null;
};

const createStudentProfile = async (userId, data) => {
    const { fullName, school, age, language, gradeLevel, address } = data;
    const result = await db.query(
        `INSERT INTO student_profiles (user_id, full_name, school_institute, age, language, grade_level, address) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [userId, fullName, school, age, language, gradeLevel, address]
    );
    return result.rows[0];
};

const createTutorProfile = async (userId, data) => {
    const {
        fullName, dob, gender, city, email, address, profilePictureUrl, bannerUrl,
        university, degreeTitle, graduationYear, experience, subject,
        gradeRange, level, medium, classType, description
    } = data;

    const result = await db.query(
        `INSERT INTO tutor_profiles (
            user_id, full_name, dob, gender, city, email, address, 
            profile_picture_url, banner_url, university, degree_title, 
            graduation_year, experience, subject, grade_range, level, 
            medium, class_type, description
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING *`,
        [
            userId, fullName, dob, gender, city, email, address,
            profilePictureUrl, bannerUrl, university, degreeTitle,
            graduationYear, experience, subject, gradeRange, level,
            medium, classType, description
        ]
    );
    return result.rows[0];
};

// Issuing a fresh code also resets the failed-attempt counter, so a user
// locked out of one code isn't still locked out of the next one.
const savePasswordResetToken = async (email, hashedToken, expiresAt) => {
    const result = await db.query(
        'UPDATE users SET reset_password_token = $1, reset_password_expires = $2, reset_password_attempts = 0 WHERE email = $3 RETURNING *',
        [hashedToken, expiresAt, normalizeEmail(email)]
    );
    return result.rows[0];
};

// Same lookup but ignoring expiry, so resetPassword can tell "you typed the
// right code, it just aged out" apart from "that isn't the current code" —
// the two need different advice and the old combined message was ambiguous.
const findUserByEmailAndResetTokenIgnoringExpiry = async (email, hashedToken) => {
    const result = await db.query(
        'SELECT * FROM users WHERE email = $1 AND reset_password_token = $2',
        [normalizeEmail(email), hashedToken]
    );
    return result.rows[0];
};

// Counts a wrong code against the current reset request, and burns the code
// entirely once MAX_RESET_ATTEMPTS is reached — without this a 6-digit code
// is brute-forceable within its 10-minute window.
const MAX_RESET_ATTEMPTS = 5;

const incrementResetAttempts = async (email) => {
    const result = await db.query(
        `UPDATE users
            SET reset_password_attempts = COALESCE(reset_password_attempts, 0) + 1,
                reset_password_token = CASE
                    WHEN COALESCE(reset_password_attempts, 0) + 1 >= $2 THEN NULL
                    ELSE reset_password_token END,
                reset_password_expires = CASE
                    WHEN COALESCE(reset_password_attempts, 0) + 1 >= $2 THEN NULL
                    ELSE reset_password_expires END
          WHERE email = $1
          RETURNING reset_password_attempts`,
        [normalizeEmail(email), MAX_RESET_ATTEMPTS]
    );
    return result.rows[0];
};

// Scoped by email as well as the hashed OTP — a lookup by hash alone
// risks matching a different user whose currently-valid 6-digit code
// happens to hash to the same value.
const findUserByEmailAndResetToken = async (email, hashedToken) => {
    const result = await db.query(
        'SELECT * FROM users WHERE email = $1 AND reset_password_token = $2 AND reset_password_expires > NOW()',
        [normalizeEmail(email), hashedToken]
    );
    return result.rows[0];
};

// Deletes a user account and everything not already handled by an
// ON DELETE CASCADE foreign key. Verified against the live schema:
//   - `requests.student_id` is ON DELETE NO ACTION, so it would block the
//     user delete with a constraint violation unless removed first.
//   - `student_profiles` has NO foreign key to users at all, so it would
//     silently orphan unless removed explicitly (tutor_profiles, by
//     contrast, already cascades on its own).
//   - Everything else referencing users.id (tutor_profiles, communities,
//     community_memberships, deadline_submissions, messages, post_comments,
//     post_reactions, posts, reviews) is ON DELETE CASCADE already.
const deleteUserAccount = async (userId, role) => {
    await db.query('DELETE FROM requests WHERE student_id = $1', [userId]);
    if (role === 'student') {
        await db.query('DELETE FROM student_profiles WHERE user_id = $1', [userId]);
    }
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    return result.rows[0];
};

const updatePassword = async (userId, newPasswordHash) => {
    const result = await db.query(
        'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL, reset_password_attempts = 0 WHERE id = $2 RETURNING id, email',
        [newPasswordHash, userId]
    );
    return result.rows[0];
};

const getStudentProfile = async (userId) => {
    const result = await db.query(
        `SELECT u.email, u.role, sp.full_name, sp.school_institute, sp.age, sp.language, sp.grade_level, sp.address, sp.phone, sp.bio, sp.profile_picture_url 
         FROM users u
         LEFT JOIN student_profiles sp ON u.id = sp.user_id
         WHERE u.id = $1`,
        [userId]
    );
    return result.rows[0];
};

const updateStudentProfile = async (userId, data) => {
    const { fullName, school, age, language, gradeLevel, address, phone, bio, profilePictureUrl } = data;
    
    // 1. Try to update existing profile
    const result = await db.query(
        `UPDATE student_profiles 
         SET full_name = COALESCE($2, full_name),
             school_institute = COALESCE($3, school_institute),
             age = COALESCE($4, age),
             language = COALESCE($5, language),
             grade_level = COALESCE($6, grade_level),
             address = COALESCE($7, address),
             phone = COALESCE($8, phone),
             bio = COALESCE($9, bio),
             profile_picture_url = COALESCE($10, profile_picture_url)
         WHERE user_id = $1
         RETURNING *`,
        [userId, fullName, school, age, language, gradeLevel, address, phone, bio, profilePictureUrl]
    );

    if (result.rows.length === 0) {
        // 2. If it does not exist, insert it
        const fallbackName = fullName || 'Student';
        const insertResult = await db.query(
            `INSERT INTO student_profiles (user_id, full_name, school_institute, age, language, grade_level, address, phone, bio, profile_picture_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [userId, fallbackName, school, age, language, gradeLevel, address, phone, bio, profilePictureUrl]
        );
        return insertResult.rows[0];
    }
    return result.rows[0];
};

const getTutorProfile = async (userId) => {
    const result = await db.query(
        `SELECT u.email, u.role, tp.full_name, tp.dob, tp.gender, tp.city, tp.address, tp.phone,
                tp.profile_picture_url, tp.banner_url, tp.university, tp.degree_title, tp.graduation_year,
                tp.experience, tp.subject, tp.grade_range, tp.level, tp.medium, tp.class_type, tp.description
         FROM users u
         LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
         WHERE u.id = $1`,
        [userId]
    );
    return result.rows[0];
};

const updateTutorProfile = async (userId, data) => {
    const {
        fullName, dob, gender, city, address, phone, university, degreeTitle,
        graduationYear, experience, subject, gradeRange, level, medium,
        classType, description, profilePictureUrl
    } = data;

    // 1. Try to update existing profile
    const result = await db.query(
        `UPDATE tutor_profiles
         SET full_name = COALESCE($2, full_name),
             dob = COALESCE($3, dob),
             gender = COALESCE($4, gender),
             city = COALESCE($5, city),
             address = COALESCE($6, address),
             phone = COALESCE($7, phone),
             university = COALESCE($8, university),
             degree_title = COALESCE($9, degree_title),
             graduation_year = COALESCE($10, graduation_year),
             experience = COALESCE($11, experience),
             subject = COALESCE($12, subject),
             grade_range = COALESCE($13, grade_range),
             level = COALESCE($14, level),
             medium = COALESCE($15, medium),
             class_type = COALESCE($16, class_type),
             description = COALESCE($17, description),
             profile_picture_url = COALESCE($18, profile_picture_url)
         WHERE user_id = $1
         RETURNING *`,
        [userId, fullName, dob, gender, city, address, phone, university, degreeTitle,
         graduationYear, experience, subject, gradeRange, level, medium, classType,
         description, profilePictureUrl]
    );

    if (result.rows.length === 0) {
        // 2. If it does not exist, insert it
        const fallbackName = fullName || 'Tutor';
        const insertResult = await db.query(
            `INSERT INTO tutor_profiles (
                user_id, full_name, dob, gender, city, address, phone, university,
                degree_title, graduation_year, experience, subject, grade_range,
                level, medium, class_type, description, profile_picture_url
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING *`,
            [userId, fallbackName, dob, gender, city, address, phone, university, degreeTitle,
             graduationYear, experience, subject, gradeRange, level, medium, classType,
             description, profilePictureUrl]
        );
        return insertResult.rows[0];
    }
    return result.rows[0];
};

module.exports = {
    createUserAccount,
    findUserByEmail,
    findFullNameByUser,
    createStudentProfile,
    createTutorProfile,
    normalizeEmail,
    savePasswordResetToken,
    findUserByEmailAndResetToken,
    findUserByEmailAndResetTokenIgnoringExpiry,
    incrementResetAttempts,
    updatePassword,
    getStudentProfile,
    updateStudentProfile,
    deleteUserAccount
};