// Routes (spec 2.1, 7.2). The router itself (BrowserRouter on the client, StaticRouter in the prerender) is supplied
// by main.tsx / entry-server.tsx. The global styles are imported first, so every component's CSS module (imported
// by the routes below) comes after them in the bundle and refines them at equal specificity.
import './styles/index.css';
import { Route, Routes } from 'react-router-dom';
import { RootRedirect } from './routes/RootRedirect';
import { LangLayout } from './routes/LangLayout';
import { NotFound } from './routes/NotFound';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/:lang/*" element={<LangLayout />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
