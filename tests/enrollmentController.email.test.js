jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/sendEmail');
jest.mock('../src/utils/enrollmentEmailTemplate');

const { pool } = require('../src/config/db');
const sendEmail = require('../src/utils/sendEmail');
const enrollmentEmailTemplate = require('../src/utils/enrollmentEmailTemplate');
const { createEnrollment } = require('../src/controllers/enrollmentController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const validBody = {
  classId: 36,
  fullName: 'Test Student',
  email: 'student@example.com',
  phone: '0771234567',
  grade: 'A/L',
  selectedDay: 'Wednesday',
  selectedTime: '6:00 PM',
};

// Regression suite for the bug where the tutor-notification email was looked
// up via `tp.id` (tutor_profiles' own primary key) instead of `tp.user_id`
// (the actual foreign key courses.tutor_id points to), which sent enrollment
// emails to the wrong tutor or silently dropped them.
describe('createEnrollment — tutor notification email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enrollmentEmailTemplate.mockReturnValue('<html>mock</html>');
    sendEmail.mockResolvedValue(undefined);
    // The controller logs status via console.log/warn on every branch —
    // silence it here so `jest --verbose` output stays readable.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  it('looks up the recipient via tutor_profiles.user_id, not tutor_profiles.id', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 36, status: 'active', mode: 'online', max_students: 30 }] }) // course check
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // capacity check
      .mockResolvedValueOnce({ rows: [{ id: 1, student_id: 48, class_id: 36, status: 'requested' }] }) // insert
      .mockResolvedValueOnce({
        rows: [{
          title: 'Vector Matrix and Integration',
          tutor_id: 47,
          tutor_email: 'janaka.abeywickrama@gmail.com',
          tutor_name: 'Janaka Abeywickrama',
        }],
      }); // tutor email lookup

    const req = { body: validBody, user: { id: 48 } };
    const res = mockRes();
    await createEnrollment(req, res, jest.fn());

    const emailLookupSql = pool.query.mock.calls[4][0];
    expect(emailLookupSql).toMatch(/tp\.user_id/);
    expect(emailLookupSql).not.toMatch(/tp\.id\b(?!.*user_id)/);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'janaka.abeywickrama@gmail.com' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('does not send an email when the resolved tutor has no email on file', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 36, status: 'active', mode: 'online', max_students: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, student_id: 48, class_id: 36, status: 'requested' }] })
      .mockResolvedValueOnce({
        rows: [{ title: 'A/L Combined Mathematics', tutor_id: 24, tutor_email: null, tutor_name: null }],
      });

    const req = { body: validBody, user: { id: 48 } };
    const res = mockRes();
    await createEnrollment(req, res, jest.fn());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201); // enrollment still succeeds without an email
  });

  it('still returns 201 for the enrollment even if sendEmail throws', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 36, status: 'active', mode: 'online', max_students: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, student_id: 48, class_id: 36, status: 'requested' }] })
      .mockResolvedValueOnce({
        rows: [{
          title: 'Chemistry Basics',
          tutor_id: 47,
          tutor_email: 'janaka.abeywickrama@gmail.com',
          tutor_name: 'Janaka',
        }],
      });

    sendEmail.mockRejectedValue(new Error('SMTP down'));

    const req = { body: validBody, user: { id: 48 } };
    const res = mockRes();
    await createEnrollment(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Enrollment request submitted successfully' })
    );
  });

  it('builds the email with the course title in the subject and the student-submitted day/time', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 36, status: 'active', mode: 'online', max_students: 30 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 4, student_id: 48, class_id: 36, status: 'requested' }] })
      .mockResolvedValueOnce({
        rows: [{
          title: 'Vector Matrix and Integration',
          tutor_id: 47,
          tutor_email: 'janaka.abeywickrama@gmail.com',
          tutor_name: 'Janaka Abeywickrama',
        }],
      });

    const req = { body: validBody, user: { id: 48 } };
    const res = mockRes();
    await createEnrollment(req, res, jest.fn());

    expect(enrollmentEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        tutorName: 'Janaka Abeywickrama',
        courseName: 'Vector Matrix and Integration',
        selectedDay: 'Wednesday',
        selectedTime: '6:00 PM',
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Vector Matrix and Integration') })
    );
  });
});
