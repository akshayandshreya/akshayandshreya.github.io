// Unknown paths (spec 2.1): replace to /en/ keeping the query and hash. The markup (four endonym links) is what the
// static 404 shell and a no-JS visitor see; with JS the redirect happens at once.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ENDONYMS, LANGS } from '../lib/langs';

export function NotFound({ to = '/en/' }: { to?: string }) {
  const { search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ pathname: to, search, hash }, { replace: true });
  }, [navigate, to, search, hash]);
  return (
    <main className="not-found pal-ivory" id="main">
      <p className="not-found__mono gold-leaf" lang="en" aria-hidden="true">
        AS
      </p>
      <ul className="not-found__langs">
        {LANGS.map((l) => (
          <li key={l}>
            <a href={`${import.meta.env.BASE_URL}${l}/${search}${hash}`} lang={l} hrefLang={l}>
              {ENDONYMS[l].full}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
