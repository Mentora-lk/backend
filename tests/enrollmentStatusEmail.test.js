jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/sendEmail');
jest.mock('../src/utils/enrollmentEmailTemplate');
jest.mock('../src/utils/enrollmentStatusEmailTemplate');

const { pool } = require('../src/config/db');
const sendEmail = require('../src/utils/sendEmail');
const enrollmentStatusEmailTemplate = require('../src/utils/enrollmentStatusEmailTemplate');
const { updateEnrollmentStatus } = require('../src/controllers/enrollmentController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const approvedEnrollment = {
  id: 1,
  class_id: 36,
  student_id: 48,
  full_name: 'Test Student',
  email: 'student@example.com',
  selected_day: 'Wednesday',
  selected_time: '6:00 PM',
  status: 'approved',
};

describe('updateEnrollmentStatus — student notification email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enrollmentStatusEmailTemplate.mockReturnValue('<html>mock</html>');
    sendEmail.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  it('emails the student when status becomes "approved"', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [approvedEnrollment] }) // existing-enrollment check
      .mockResolvedValueOnce({ rows: [approvedEnrollment] }) // UPDATE ... RETURNING *
      .mockResolvedValueOnce({ rows: [{ title: 'Vector Matrix and Integration', tutor_name: 'Janaka Abeywickrama' }] }); // course/tutor lookup

    const req = { params: { id: '1' }, body: { status: 'approved' } };
    const res = mockRes();
    await updateEnrollmentStatus(req, res, jest.fn());

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'student@example.com',
        subject: expect.stringContaining('Vector Matrix and Integration'),
      })
    );
    expect(enrollmentStatusEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', studentName: 'Test Student' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Enrollment approved' })
    );
  });

  it('emails the student when status becomes "rejected"', async () => {
    const rejected = { ...approvedEnrollment, status: 'rejected' };
    pool.query
      .mockResolvedValueOnce({ rows: [rejected] })
      .mockResolvedValueOnce({ rows: [rejected] })
      .mockResolvedValueOnce({ rows: [{ title: 'Vector Matrix and Integration', tutor_name: 'Janaka Abeywickrama' }] });

    const req = { params: { id: '1' }, body: { status: 'rejected' } };
    const res = mockRes();
    await updateEnrollmentStatus(req, res, jest.fn());

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'student@example.com' })
    );
    expect(enrollmentStatusEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' })
    );
  });

  it('does not email for statuses other than approved/rejected', async () => {
    const active = { ...approvedEnrollment, status: 'active' };
    pool.query
      .mockResolvedValueOnce({ rows: [active] })
      .mockResolvedValueOnce({ rows: [active] });

    const req = { params: { id: '1' }, body: { status: 'active' } };
    const res = mockRes();
    await updateEnrollmentStatus(req, res, jest.fn());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Enrollment active' })
    );
  });

  it('still returns the status update successfully even if sendEmail throws', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [approvedEnrollment] })
      .mockResolvedValueOnce({ rows: [approvedEnrollment] })
      .mockResolvedValueOnce({ rows: [{ title: 'Vector Matrix and Integration', tutor_name: 'Janaka Abeywickrama' }] });

    sendEmail.mockRejectedValue(new Error('SMTP down'));

    const req = { params: { id: '1' }, body: { status: 'approved' } };
    const res = mockRes();
    await updateEnrollmentStatus(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Enrollment approved' })
    );
  });

  it('returns 404 without querying for email when the enrollment does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // existing-enrollment check finds nothing

    const req = { params: { id: '999' }, body: { status: 'approved' } };
    const res = mockRes();
    await updateEnrollmentStatus(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
