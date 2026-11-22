export default function Brand({ large = false }) {
  return (
    <div className={large ? 'brand brand-large' : 'brand'}>
      <span className="brand-mark">U</span>
      <span className="brand-name">Unidex</span>
    </div>
  );
}
