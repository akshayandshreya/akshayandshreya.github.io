/** A short gold rule meeting at a bindu (card.js goldRule), decorative. */
export function GoldRule({ className = '' }: { className?: string }) {
  return (
    <span className={`gold-rule ${className}`} aria-hidden="true">
      <span className="gold-rule__line" />
      <span className="gold-rule__bindu" />
      <span className="gold-rule__line" />
    </span>
  );
}
