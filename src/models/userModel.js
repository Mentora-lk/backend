const db = require('../config/db');

const createUserAccount = async (email, passwordHash, role) => {
    const result = await db.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [email, passwordHash, role]
    );
    return result.rows[0];
};

const findUserByEmail = async (email) => {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
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
        university, degreeTitle, graduationYear, experience, subjects, 
        gradeRange, level, medium, classType, description 
    } = data;
    
    const result = await db.query(
        `INSERT INTO tutor_profiles (
            user_id, full_name, dob, gender, city, email, address, 
            profile_picture_url, banner_url, university, degree_title, 
            graduation_year, experience, subjects, grade_range, level, 
            medium, class_type, description
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING *`,
        [
            userId, fullName, dob, gender, city, email, address, 
            profilePictureUrl, bannerUrl, university, degreeTitle, 
            graduationYear, experience, subjects, gradeRange, level, 
            medium, classType, description
        ]
    );
    return result.rows[0];
};

const savePasswordResetToken = async (email, hashedToken, expiresAt) => {
    const result = await db.query(
        'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3 RETURNING *',
        [hashedToken, expiresAt, email]
    );
    return result.rows[0];
};

const findUserByResetToken = async (hashedToken) => {
    const result = await db.query(
        'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
        [hashedToken]
    );
    return result.rows[0];
};

const updatePassword = async (userId, newPasswordHash) => {
    const result = await db.query(
        'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2 RETURNING id, email',
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

module.exports = {
    createUserAccount,
    findUserByEmail,
    createStudentProfile,
    createTutorProfile,
    savePasswordResetToken,
    findUserByResetToken,
    updatePassword,
    getStudentProfile,
    updateStudentProfile
};