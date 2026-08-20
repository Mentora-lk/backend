const weeklyReminderEmailTemplate = require('../src/utils/weeklyReminderEmailTemplate');

describe('weeklyReminderEmailTemplate', () => {
  it('includes the student name and every session\'s course, tutor, day, and time', () => {
    const html = weeklyReminderEmailTemplate({
      studentName: 'Amal Perera',
      sessions: [
        { courseTitle: 'Combined Mathematics', tutorName: 'Janaka Abeywickrama', selectedDay: 'Monday', selectedTime: '6:00 PM' },
        { courseTitle: 'Chemistry Basics', tutorName: 'Nadeesha Silva', selectedDay: 'Thursday', selectedTime: '4:30 PM' },
      ],
    });

    expect(html).toContain('Amal Perera');
    expect(html).toContain('Combined Mathematics');
    expect(html).toContain('Janaka Abeywickrama');
    expect(html).toContain('Monday');
    expect(html).toContain('6:00 PM');
    expect(html).toContain('Chemistry Basics');
    expect(html).toContain('Nadeesha Silva');
    expect(html).toContain('Thursday');
    expect(html).toContain('4:30 PM');
  });

  it('falls back to placeholder text for a missing day/time', () => {
    const html = weeklyReminderEmailTemplate({
      studentName: 'Amal',
      sessions: [{ courseTitle: 'Physics', tutorName: 'Tutor', selectedDay: '', selectedTime: '' }],
    });

    expect(html).toContain('Not specified');
  });
});
