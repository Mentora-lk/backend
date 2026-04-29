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

module.exports = {
    createUserAccount,
    findUserByEmail,
    createStudentProfile,
    createTutorProfile
};