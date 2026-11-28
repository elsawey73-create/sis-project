import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCHEDULE_DAYS,
  SCHEDULE_PALETTE_SIZE,
  courseColorClass,
  courseColorIndex,
  courseSectionKey,
  nextScheduleMeetings,
  scheduleDayName,
} from './schedule.js';

test('the schedule week is Sunday through Thursday', () => {
  assert.deepEqual(SCHEDULE_DAYS, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
  assert.equal(SCHEDULE_DAYS.includes('Sat'), false);
  assert.equal(SCHEDULE_DAYS.includes('Fri'), false);
});

test('Friday and Saturday default the schedule day to Sunday', () => {
  assert.equal(scheduleDayName(new Date(2026, 10, 27)), 'Sun'); // Friday
  assert.equal(scheduleDayName(new Date(2026, 10, 28)), 'Sun'); // Saturday
  assert.equal(scheduleDayName(new Date(2026, 10, 29)), 'Sun'); // Sunday
  assert.equal(scheduleDayName(new Date(2026, 10, 30)), 'Mon');
  assert.equal(scheduleDayName(new Date(2026, 11, 3)), 'Thu');
});

test('a course and section keep one color, and another section differs', () => {
  const lecture = { code: 'CS101', section: '1' };
  const lab = { code: 'CS101', section: 1, room: 'Lab1' };
  const other = { code: 'CS101', section: '2' };
  assert.equal(courseSectionKey(lecture), courseSectionKey(lab));
  assert.equal(courseColorIndex(lecture), courseColorIndex(lab));
  assert.equal(courseColorClass(lecture), courseColorClass(lab));
  assert.notEqual(courseColorIndex(lecture), courseColorIndex(other));
  assert.match(courseColorClass(lecture), /^slot-tone-\d+$/);
});

test('nearby course codes still get different colors', () => {
  const codes = ['CS101', 'CS102', 'CS201', 'ENG101', 'IS210', 'MTH102', 'MTH201'];
  const indexes = codes.map((code) => courseColorIndex({ code, section: '1' }));
  assert.equal(new Set(indexes).size, codes.length);
});

test('the same key is stable and different courses spread across the palette', () => {
  const courses = ['CSE301n', 'ECE302n', 'EEG201', 'EEP407nE', 'HUM001n', 'MTH101', 'BSE001n', 'ENG101'];
  const indexes = courses.map((code) => courseColorIndex({ code, section: '1' }));
  assert.deepEqual(indexes, courses.map((code) => courseColorIndex({ code, section: '1' })));
  assert.equal(new Set(indexes).size > 1, true);
  for (const index of indexes) {
    assert.equal(index >= 0 && index < SCHEDULE_PALETTE_SIZE, true);
  }
});

test('Saturday meetings are left out, and Friday or Saturday defaults to Sunday', () => {
  const courses = [{
    code: 'CS101',
    section: '1',
    name_ar: 'مقدمة',
    name_en: 'Intro',
    meetings: [
      { day_of_week: 'Sat', start_time: '09:00', end_time: '11:00' },
      { day_of_week: 'Sun', start_time: '11:00', end_time: '13:00' },
      { day_of_week: 'Wed', start_time: '09:00', end_time: '11:00' },
    ],
  }];
  const friday = nextScheduleMeetings(courses, new Date(2026, 10, 27, 15, 0));
  const saturday = nextScheduleMeetings(courses, new Date(2026, 10, 28, 9, 0));
  assert.equal(friday.length, 1);
  assert.equal(friday[0].day_of_week, 'Sun');
  assert.equal(saturday[0].day_of_week, 'Sun');
  assert.equal(friday.some((meeting) => meeting.day_of_week === 'Sat'), false);
});

test('a finished Thursday points at the next Sunday, not Saturday', () => {
  const courses = [{
    code: 'MTH101',
    section: '2',
    meetings: [
      { day_of_week: 'Sat', start_time: '11:00', end_time: '13:00' },
      { day_of_week: 'Thu', start_time: '09:00', end_time: '11:00' },
      { day_of_week: 'Sun', start_time: '11:00', end_time: '13:00' },
    ],
  }];
  const upcoming = nextScheduleMeetings(courses, new Date(2026, 11, 3, 18, 0));
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].day_of_week, 'Sun');
  assert.equal(upcoming[0].section, '2');
});
