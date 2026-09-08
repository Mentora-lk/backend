const db = require('../config/db');
const { normalizeEmail } = require('./userModel');

const MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_GRACE_MS = 60 * 60 * 1000; // 1 hour — long enough to finish the 4-step tutor wizard

// Upsert: this email may not have a row yet. Resets attempts on every fresh
// send (mirrors savePasswordResetToken), but deliberately leaves verified_at/
// verified_expires_at untouched — an accidental resend after a successful
// verify must not un-verify the address.
const saveEmailVerificationOtp = async (email, hashedOtp, expiresAt) => {
    const result = await db.query(
        `INSERT INTO email_verifications (email, otp_hash, otp_expires_at, attempts)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (email) DO UPDATE
         SET otp_hash = $2, otp_expires_at = $3, attempts = 0, updated_at = NOW()
         RETURNING *`,
        [normalizeEmail(email), hashedOtp, expiresAt]
    );
    return result.rows[0];
};

const findVerificationByEmailAndOtp = async (email, hashedOtp) => {
    const result = await db.query(
        'SELECT * FROM email_verifications WHERE email = $1 AND otp_hash = $2 AND otp_expires_at > NOW()',
        [normalizeEmail(email), hashedOtp]
    );
    return result.rows[0];
};

// Same lookup but ignoring expiry, so verifyEmailCode can tell "right code,
// just aged out" apart from "that isn't the current code".
const findVerificationByEmailAndOtpIgnoringExpiry = async (email, hashedOtp) => {
    const result = await db.query(
        'SELECT * FROM email_verifications WHERE email = $1 AND otp_hash = $2',
        [normalizeEmail(email), hashedOtp]
    );
    return result.rows[0];
};

// Counts a wrong code against the current verification request, and burns
// the code entirely once MAX_VERIFY_ATTEMPTS is reached.
const incrementVerificationAttempts = async (email) => {
    const result = await db.query(
        `UPDATE email_verifications
            SET attempts = COALESCE(attempts, 0) + 1,
                otp_hash = CASE
                    WHEN COALESCE(attempts, 0) + 1 >= $2 THEN NULL
                    ELSE otp_hash END,
                otp_expires_at = CASE
                    WHEN COALESCE(attempts, 0) + 1 >= $2 THEN NULL
                    ELSE otp_expires_at END,
                updated_at = NOW()
          WHERE email = $1
          RETURNING attempts`,
        [normalizeEmail(email), MAX_VERIFY_ATTEMPTS]
    );
    return result.rows[0];
};

// Called on a correct code: stamps verified_at/verified_expires_at and burns
// the OTP so the same code can't be replayed.
const markEmailVerified = async (email) => {
    const result = await db.query(
        `UPDATE email_verifications
            SET verified_at = NOW(),
                verified_expires_at = NOW() + INTERVAL '1 hour',
                otp_hash = NULL,
                otp_expires_at = NULL,
                attempts = 0,
                updated_at = NOW()
          WHERE email = $1
          RETURNING *`,
        [normalizeEmail(email)]
    );
    return result.rows[0];
};

// The actual gate used by registerStudent/registerTutor.
const isEmailCurrentlyVerified = async (email) => {
    const result = await db.query(
        'SELECT 1 FROM email_verifications WHERE email = $1 AND verified_at IS NOT NULL AND verified_expires_at > NOW()',
        [normalizeEmail(email)]
    );
    return result.rows.length > 0;
};

// Cleanup after a successful account creation.
const clearEmailVerification = async (email) => {
    await db.query('DELETE FROM email_verifications WHERE email = $1', [normalizeEmail(email)]);
};

module.exports = {
    saveEmailVerificationOtp,
    findVerificationByEmailAndOtp,
    findVerificationByEmailAndOtpIgnoringExpiry,
    incrementVerificationAttempts,
    markEmailVerified,
    isEmailCurrentlyVerified,
    clearEmailVerification,
    MAX_VERIFY_ATTEMPTS,
    VERIFIED_GRACE_MS,
};
