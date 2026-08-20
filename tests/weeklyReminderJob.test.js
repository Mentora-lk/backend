jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/sendEmail');
jest.mock('../src/utils/weeklyReminderEmailTemplate');

const { pool } = require('../src/config/db');
const sendEmail = require('../src/utils/sendEmail');
const weeklyReminderEmailTemplate = require('../src/utils/weeklyReminderEmailTemplate');
const { sendWeeklySessionReminders } = require('../src/jobs/weeklyReminderJob');

describe('sendWeeklySessionReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    weeklyReminderEmailTemplate.mockReturnValue('<html>mock</html>');
    sendEmail.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it('sends one digest email per student, even with multiple approved/active classes', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { student_id: 48, student_email: 'a@example.com', student_name: 'A Student', course_title: 'Maths', tutor_name: 'Tutor A', selected_day: 'Monday', selected_time: '6:00 PM' },
        { student_id: 48, student_email: 'a@example.com', student_name: 'A Student', course_title: 'Physics', tutor_name: 'Tutor B', selected_day: 'Wednesday', selected_time: '7:00 PM' },
      ],
    });

    const summary = await sendWeeklySessionReminders();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@example.com' }));
    expect(weeklyReminderEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        studentName: 'A Student',
        sessions: [
          expect.objectContaining({ courseTitle: 'Maths', tutorName: 'Tutor A' }),
          expect.objectContaining({ courseTitle: 'Physics', tutorName: 'Tutor B' }),
        ],
      })
    );
    expect(summary).toEqual({ sent: 1, failed: 0 });
  });

  it('sends separate emails to distinct students, each with only their own sessions', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { student_id: 48, student_email: 'a@example.com', student_name: 'A Student', course_title: 'Maths', tutor_name: 'Tutor A', selected_day: 'Monday', selected_time: '6:00 PM' },
        { student_id: 51, student_email: 'b@example.com', student_name: 'B Student', course_title: 'Chemistry', tutor_name: 'Tutor C', selected_day: 'Friday', selected_time: '4:00 PM' },
      ],
    });

    const summary = await sendWeeklySessionReminders();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@example.com' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'b@example.com' }));
    expect(summary).toEqual({ sent: 2, failed: 0 });
  });

  it('sends nothing when no student has an approved/active enrollment', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const summary = await sendWeeklySessionReminders();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(summary).toEqual({ sent: 0, failed: 0 });
  });

  it('continues the batch when one recipient send fails', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { student_id: 48, student_email: 'a@example.com', student_name: 'A Student', course_title: 'Maths', tutor_name: 'Tutor A', selected_day: 'Monday', selected_time: '6:00 PM' },
        { student_id: 51, student_email: 'b@example.com', student_name: 'B Student', course_title: 'Chemistry', tutor_name: 'Tutor C', selected_day: 'Friday', selected_time: '4:00 PM' },
      ],
    });

    sendEmail
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValueOnce(undefined);

    const summary = await sendWeeklySessionReminders();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({ sent: 1, failed: 1 });
  });

  it('only queries enrollments with status approved or active', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await sendWeeklySessionReminders();

    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/status IN \('approved', 'active'\)/);
  });
});
