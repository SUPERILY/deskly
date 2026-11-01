export default function Switch({ on, onChange, label, hint, disabled }) {
  return (
    <button
      className={'switch-row' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
      disabled={disabled}
      role="switch"
      aria-checked={!!on}
    >
      <span className="switch-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch"><i /></span>
    </button>
  );
}
