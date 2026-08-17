const enrollmentEmailTemplate = require('../src/utils/enrollmentEmailTemplate');

describe('enrollmentEmailTemplate', () => {
  const baseParams = {
    tutorName: 'Janaka Abeywickrama',
    studentName: 'Test Boy',
    courseName: 'Physics Fundamentals',
    selectedDay: 'Wednesday',
    selectedTime: '6:00 PM',
    preferredMode: 'offline',
    studentMessage: 'Looking forward to this class!',
  };

  it('includes the tutor name in the greeting', () => {
    const html = enrollmentEmailTemplate(baseParams);
    expect(html).toContain('Hello Janaka Abeywickrama! 👋');
  });

  it('includes the course name, student name, day, time, and mode in the details table', () => {
    const html = enrollmentEmailTemplate(baseParams);
    expect(html).toContain('Physics Fundamentals');
    expect(html).toContain('Test Boy');
    expect(html).toContain('Wednesday');
    expect(html).toContain('6:00 PM');
    expect(html).toContain('offline');
  });

  it('falls back to "Online" when preferredMode is not provided', () => {
    const html = enrollmentEmailTemplate({ ...baseParams, preferredMode: undefined });
    expect(html).toContain('Online');
  });

  it('includes the student message block when a message is provided', () => {
    const html = enrollmentEmailTemplate(baseParams);
    expect(html).toContain('Message from Student');
    expect(html).toContain('Looking forward to this class!');
  });

  it('omits the student message block when no message is provided', () => {
    const html = enrollmentEmailTemplate({ ...baseParams, studentMessage: null });
    expect(html).not.toContain('Message from Student');
  });

  it('links the CTA button to the tutor dashboard using FRONTEND_URL', () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://mentora.lk';
    const html = enrollmentEmailTemplate(baseParams);
    expect(html).toContain('https://mentora.lk/dashboard/tutor');
    process.env.FRONTEND_URL = original;
  });

  it('falls back to localhost:3000 when FRONTEND_URL is not set', () => {
    const original = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    const html = enrollmentEmailTemplate(baseParams);
    expect(html).toContain('http://localhost:3000/dashboard/tutor');
    process.env.FRONTEND_URL = original;
  });
});
