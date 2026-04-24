const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');

const registerStudent = async (req, res) => {
    try {
        const { email, password, fullName, school, age, language, gradeLevel, address } = req.body;

        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Transaction simulation (Ideally use BEGIN/COMMIT via pg client)
        const user = await userModel.createUserAccount(email, passwordHash, 'student');
        const profile = await userModel.createStudentProfile(user.id, { fullName, school, age, language, gradeLevel, address });

        res.status(201).json({
            id: user.id,
            email: user.email,
            role: user.role,
            profile,
            token: generateToken(user.id, user.role)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const registerTutor = async (req, res) => {
    try {
        // In a real scenario with files, you'd access req.files for images uploaded via multer
        const { email, password, fullName, dob, gender, city, address, university, degree, graduationYear, experience, description } = req.body;

        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await userModel.createUserAccount(email, passwordHash, 'tutor');
        const profile = await userModel.createTutorProfile(user.id, { fullName, dob, gender, city, address, university, degree, graduationYear, experience, description });

        res.status(201).json({
            id: user.id,
            email: user.email,
            role: user.role,
            profile,
            token: generateToken(user.id, user.role)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await userModel.findUserByEmail(email);
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            token: generateToken(user.id, user.role)
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { registerStudent, registerTutor, loginUser };