// "/" (spec 2.1.1): the stored choice, else the browser languages, else en; replace, keeping ?query and #hash.
// public/redirect.js does the same for the static root page before any JS bundle loads.
import { Navigate, useLocation } from 'react-router-dom';
import { detectLang, readStoredLang } from '../lib/langs';

export function RootRedirect() {
  const { search, hash } = useLocation();
  const lang = detectLang(readStoredLang(), typeof navigator === 'undefined' ? undefined : navigator.languages);
  return <Navigate replace to={{ pathname: `/${lang}/`, search, hash }} />;
}
