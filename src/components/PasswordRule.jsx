// Password rule for new passwords: at least 15 characters, with letters and numbers.
export const PASSWORD_MIN = 15;

export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < PASSWORD_MIN || !/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) {
    return `Use at least ${PASSWORD_MIN} characters, with both letters and numbers.`;
  }
  return '';
}

export default function PasswordRule({ value }) {
  const s = String(value || '');
  const items = [
    [s.length >= PASSWORD_MIN, `At least ${PASSWORD_MIN} characters (${s.length})`],
    [/[A-Za-z]/.test(s), 'Letters'],
    [/[0-9]/.test(s), 'Numbers'],
  ];
  return (
    <ul className="pw-rule" aria-live="polite">
      {items.map(([okay, label]) => <li key={label} className={okay ? 'met' : ''}>{okay ? '✓' : '○'} {label}</li>)}
    </ul>
  );
}
