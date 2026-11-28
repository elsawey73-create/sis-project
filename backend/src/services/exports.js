const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function pdfBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

function writeLine(doc, text, options) {
  doc.fontSize(options?.size || 11).text(String(text ?? ''), { lineGap: 2 });
}

async function workbookBuffer(build) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Unidex';
  await build(workbook);
  return workbook.xlsx.writeBuffer();
}

function addSheet(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((column) => {
    column.width = Math.min(36, Math.max(12, (column.header || '').length + 4));
  });
  return sheet;
}

const STATUS = { present: 'present', late: 'late', excused: 'excused' };

function markLabel(status, sessionOpen) {
  if (status) return STATUS[status] || status;
  return sessionOpen ? 'unrecorded' : 'absent';
}

async function sessionReportXlsx(session, students) {
  return workbookBuffer((workbook) => {
    addSheet(workbook, 'Session', [
      'Student code', 'Name (AR)', 'Name (EN)', 'Status', 'Method', 'Marked by', 'Distance m', 'Scanned at',
    ], students.map((s) => [
      s.student_code,
      s.full_name_ar,
      s.full_name_en,
      markLabel(s.status, session.status === 'open'),
      s.method || '',
      s.marked_by_en || s.marked_by_ar || '',
      s.distance_m == null ? '' : Number(s.distance_m),
      s.scanned_at || '',
    ]));
  });
}

async function sessionReportPdf(session, students) {
  return pdfBuffer((doc) => {
    writeLine(doc, `Unidex attendance — ${session.code}`, { size: 16 });
    writeLine(doc, `${session.name_en || ''} / ${session.name_ar || ''}`);
    writeLine(doc, `Date ${session.session_date} · ${session.status}`);
    doc.moveDown(0.5);
    students.forEach((s) => {
      const status = markLabel(s.status, session.status === 'open');
      const distance = s.distance_m == null ? '' : ` · ${s.distance_m} m`;
      const manual = s.method === 'manual' ? ` · manual ${s.marked_by_en || s.marked_by_ar || ''}` : '';
      writeLine(doc, `${s.student_code}  ${s.full_name_en || s.full_name_ar}  ${status}${manual}${distance}`);
    });
  });
}

async function courseReportXlsx(offering, summary, sessions) {
  return workbookBuffer((workbook) => {
    addSheet(workbook, 'Summary', [
      'Student code', 'Name (AR)', 'Name (EN)', 'Attended', 'Sessions', 'Absent', 'Absent %',
    ], summary.map((s) => [
      s.student_code, s.full_name_ar, s.full_name_en, s.attended, s.total_sessions, s.absent, s.absent_pct,
    ]));
    addSheet(workbook, 'Sessions', [
      'Date', 'Session', 'Student code', 'Name', 'Status', 'Method',
    ], sessions);
  });
}

async function courseReportPdf(offering, summary) {
  return pdfBuffer((doc) => {
    writeLine(doc, `Unidex absence report — ${offering.code}`, { size: 16 });
    writeLine(doc, `${offering.name_en || ''} / ${offering.name_ar || ''} · section ${offering.section}`);
    doc.moveDown(0.5);
    summary.forEach((s) => {
      writeLine(doc, `${s.student_code}  ${s.full_name_en || s.full_name_ar}  attended ${s.attended}/${s.total_sessions}  absent ${s.absent} (${s.absent_pct}%)`);
    });
  });
}

async function studentExportXlsx({ grades, attendance, schedule }) {
  return workbookBuffer((workbook) => {
    addSheet(workbook, 'Grades', [
      'Semester', 'Code', 'Course', 'Credits', 'Total', 'Letter', 'Points', 'In cumulative GPA',
    ], grades.map((g) => [
      g.semester_en || g.semester_ar, g.code, g.name_en || g.name_ar, g.credit_hours, g.total, g.letter, g.points, g.replaced ? 'no' : 'yes',
    ]));
    addSheet(workbook, 'Attendance', [
      'Semester', 'Code', 'Course', 'Date', 'Status', 'Method', 'Distance m',
    ], attendance.map((a) => [
      a.semester_en || a.semester_ar, a.code, a.name_en || a.name_ar, a.session_date, a.status || (a.session_status === 'closed' ? 'absent' : 'unrecorded'), a.method || '', a.distance_m ?? '',
    ]));
    addSheet(workbook, 'Schedule', [
      'Code', 'Course', 'Section', 'Day', 'Start', 'End', 'Room', 'Type',
    ], schedule);
  });
}

async function transcriptPdf(transcript) {
  return pdfBuffer((doc) => {
    const student = transcript.student;
    writeLine(doc, 'Unidex academic transcript', { size: 16 });
    writeLine(doc, `${student.full_name_en || ''} / ${student.full_name_ar || ''}`);
    writeLine(doc, `${student.student_code} · ${student.department_en || student.department_ar || ''}`);
    writeLine(doc, `CGPA ${transcript.standing.cgpa ?? '—'} · earned ${transcript.standing.credits_earned}`);
    doc.moveDown(0.6);
    transcript.semesters.forEach((semester) => {
      writeLine(doc, `${semester.name_en || semester.name_ar} · GPA ${semester.gpa ?? '—'}`, { size: 13 });
      semester.courses.forEach((course) => {
        writeLine(doc, `${course.code}  ${course.name_en || course.name_ar}  ${course.letter || ''}  ${course.points ?? ''}  ${course.replaced ? '(earlier attempt)' : ''}`);
      });
      doc.moveDown(0.4);
    });
  });
}

async function schedulePdf(payload) {
  return pdfBuffer((doc) => {
    const semester = payload.semester;
    writeLine(doc, 'Unidex schedule', { size: 16 });
    writeLine(doc, semester ? (semester.name_en || semester.name_ar) : '');
    doc.moveDown(0.4);
    payload.courses.forEach((course) => {
      writeLine(doc, `${course.code}  ${course.name_en || course.name_ar}  §${course.section}`, { size: 12 });
      (course.meetings || []).forEach((meeting) => {
        writeLine(doc, `  ${meeting.day_of_week} ${String(meeting.start_time).slice(0, 5)}–${String(meeting.end_time).slice(0, 5)}  ${meeting.room}  ${meeting.type}`);
      });
    });
  });
}

const DAY_RRULE = { Sat: 'SA', Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH' };

function icsEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsStamp(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function scheduleIcs(payload) {
  const semester = payload.semester || {};
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unidex//Schedule//EN',
    'CALSCALE:GREGORIAN',
  ];
  const until = semester.end_date ? String(semester.end_date).replace(/-/g, '') + 'T235959Z' : '';
  payload.courses.forEach((course) => {
    (course.meetings || []).forEach((meeting) => {
      const byday = DAY_RRULE[meeting.day_of_week];
      if (!byday) return;
      const start = String(meeting.start_time).slice(0, 5).replace(':', '') + '00';
      const end = String(meeting.end_time).slice(0, 5).replace(':', '') + '00';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:offering-${course.offering_id}-${meeting.id || meeting.day_of_week + start}@unidex`);
      lines.push(`DTSTAMP:${icsStamp(new Date())}`);
      lines.push(`SUMMARY:${icsEscape(`${course.code} ${course.name_en || course.name_ar}`)}`);
      lines.push(`LOCATION:${icsEscape(meeting.room)}`);
      lines.push(`DESCRIPTION:${icsEscape(meeting.type || 'lecture')}`);
      if (semester.start_date) {
        const day = String(semester.start_date).replace(/-/g, '');
        lines.push(`DTSTART:${day}T${start}`);
        lines.push(`DTEND:${day}T${end}`);
      }
      if (until) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`);
      lines.push('END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = {
  sessionReportXlsx,
  sessionReportPdf,
  courseReportXlsx,
  courseReportPdf,
  studentExportXlsx,
  transcriptPdf,
  schedulePdf,
  scheduleIcs,
  markLabel,
};
