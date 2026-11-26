const SHAPES = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
    </>
  ),
  grades: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15v-3M12 15V8M16 15v-5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2 11 14.6 15.5 9.5" />
    </>
  ),
  more: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5h6.2A2.8 2.8 0 0 1 14 8.3V19a2.2 2.2 0 0 0-2.2-2.2H5z" />
      <path d="M19 5.5h-6.2A2.8 2.8 0 0 0 10 8.3V19a2.2 2.2 0 0 1 2.2-2.2H19z" />
    </>
  ),
  catalog: (
    <>
      <path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.2A2.2 2.2 0 0 0 6 21.7z" />
      <path d="M6 4.5A2.2 2.2 0 0 0 3.8 6.7V19" />
    </>
  ),
  chat: (
    <>
      <path d="M6 16.5 4.5 19.5 8 18.2A8 8 0 1 0 6 16.5z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5h12l-1.2-2V11a4.8 4.8 0 0 0-9.6 0v3.5z" />
      <path d="M10 16.5a2 2 0 0 0 4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M4.8 17.5c.5-2.2 2.2-3.3 4.2-3.3s3.7 1.1 4.2 3.3" />
      <circle cx="16" cy="9.2" r="2" />
      <path d="M15.2 14.3c1.6.2 2.8 1.2 3.3 3.2" />
    </>
  ),
  qr: (
    <>
      <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5z" />
      <path d="M14 14h2v2h-2zM18 14h1v5h-5v-1M14 18h2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  doc: (
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  back: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  bolt: <path d="M13 3 6 13.5h5L10 21l8-11.5h-5z" />,
};

export default function Icon({ name }) {
  return (
    <svg className="native-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SHAPES[name]}
    </svg>
  );
}
