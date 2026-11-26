export default function Brand({ large = false, compact = false }) {
  return (
    <div className={large ? 'brand brand-large' : 'brand'}>
      <span className="brand-mark">U</span>
      {!compact && <span className="brand-name">Unidex</span>}
    </div>
  );
}
