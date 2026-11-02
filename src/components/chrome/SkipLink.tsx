import { useT } from '../../i18n/context';

export function SkipLink() {
  const t = useT();
  return (
    <a className="skip-link" href="#invitation">
      {t('a11y.skip')}
    </a>
  );
}
