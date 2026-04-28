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
    // Adding basic fields from the UI forms
    const { fullName, dob, gender, city, address, university, degree, graduationYear, experience, description } = data;
    const result = await db.query(
        `INSERT INTO tutor_profiles (user_id, full_name, dob, gender, city, address, university, degree_title, graduation_year, experience, description) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [userId, fullName, dob, gender, city, address, university, degree, graduationYear, experience, description]
    );
    return result.rows[0];
};

module.exports = {
    createUserAccount,
    findUserByEmail,
    createStudentProfile,
    createTutorProfile
};