// Shared timetable rules for the website week grid and the native day agenda.
// Saturday is omitted from the view only. Stored meetings are left unchanged.

export const SCHEDULE_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

const FROM_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SCHEDULE_PALETTE_SIZE = 16;

// Friday and Saturday are outside the shown week, so the schedule treats Sunday as today.
export function scheduleDayName(date = new Date()) {
  const name = FROM_JS[date.getDay()] || 'Sun';
  if (name === 'Fri' || name === 'Sat') return 'Sun';
  return name;
}

export function courseSectionKey(item) {
  const course = item?.code ?? item?.course_id ?? '';
  const section = item?.section == null ? '' : String(item.section).trim();
  return `${String(course)}|${section}`;
}

// FNV-1a with a final mixer so short course codes spread across the palette.
// The same course code and section always land on the same index.
export function courseColorIndex(item) {
  const key = courseSectionKey(item);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % SCHEDULE_PALETTE_SIZE;
}

export function courseColorClass(item) {
  return `slot-tone-${courseColorIndex(item)}`;
}

function minutesOf(time) {
  const [h, m] = String(time || '').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Next remaining meeting inside Sun–Thu. Friday and Saturday start the week at Sunday.
// A meeting on any other day (including Saturday) is not part of this view.
export function nextScheduleMeetings(courses, now = new Date()) {
  const todayIdx = SCHEDULE_DAYS.indexOf(FROM_JS[now.getDay()]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const items = (courses || []).flatMap((course) => (course.meetings || []).map((meeting) => ({
    ...meeting,
    code: course.code,
    section: course.section,
    name_ar: course.name_ar,
    name_en: course.name_en,
    idx: SCHEDULE_DAYS.indexOf(meeting.day_of_week),
  }))).filter((meeting) => meeting.idx >= 0);
  if (!items.length) return [];
  const rank = (meeting) => {
    if (todayIdx < 0) return meeting.idx;
    if (meeting.idx > todayIdx) return meeting.idx;
    if (meeting.idx === todayIdx && minutesOf(meeting.start_time) > nowMin) return meeting.idx;
    return meeting.idx + SCHEDULE_DAYS.length;
  };
  const best = Math.min(...items.map(rank));
  return items.filter((meeting) => rank(meeting) === best).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
}
