/** The gold joiner: Cormorant italic "&" (lang en) in en/hi/mai, Atma "ও" in bn (spec 1.5). */
export function Joiner({ value, className = '' }: { value: string; className?: string }) {
  const latin = value === '&';
  return (
    <span
      className={`joiner gold-leaf ${latin ? 'joiner--amp' : 'joiner--word'} ${className}`}
      lang={latin ? 'en' : undefined}
    >
      {value}
    </span>
  );
}
