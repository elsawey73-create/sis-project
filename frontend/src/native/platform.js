import { Capacitor } from '@capacitor/core';

// True only inside the Capacitor Android/iOS shell. The website stays false.
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function openScanner() {
  window.dispatchEvent(new Event('unidex-open-scan'));
}

const TITLES = [
  ['/student/registration', 'nav.registration'],
  ['/student/schedule', 'nav.schedule'],
  ['/student/grades', 'nav.grades'],
  ['/student/transcript', 'nav.transcript'],
  ['/student/attendance', 'nav.attendance'],
  ['/attend', 'nav.scan'],
  ['/student/profile', 'profile.edit'],
  ['/student/password', 'password.change'],
  ['/student', 'nav.home'],
  ['/doctor/attendance', 'nav.attendance'],
  ['/doctor/offerings', 'doc.gradesStudents'],
  ['/doctor', 'nav.myCourses'],
  ['/admin/catalog', 'nav.manageCatalog'],
  ['/admin/offerings', 'nav.offerings'],
  ['/admin/users', 'nav.users'],
  ['/admin', 'nav.dashboard'],
  ['/calendar', 'nav.calendar'],
  ['/catalog', 'nav.catalog'],
  ['/messages', 'nav.messages'],
  ['/notifications', 'nav.notifications'],
];

export function screenTitleKey(pathname) {
  const hit = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : 'app.name';
}

export function isDetailPath(pathname) {
  return /^\/doctor\/(offerings|attendance)\/[^/]+/.test(pathname)
    || /^\/messages\/[^/]+/.test(pathname)
    || pathname === '/attend'
    || pathname === '/student/profile'
    || pathname === '/student/password';
}
