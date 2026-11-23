// Statuses that still hold a seat and stay on the current-term schedule.
// Publishing a grade must not remove the student from the course.
const OCCUPYING_SQL = "'enrolled','completed','failed'";

function occupying(column) {
  return `${column} IN (${OCCUPYING_SQL})`;
}

module.exports = { occupying };
