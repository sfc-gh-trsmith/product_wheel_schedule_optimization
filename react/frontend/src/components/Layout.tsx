import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-text">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-10 h-12 flex items-center justify-between px-6 bg-white/80 dark:bg-dark-surface/80 backdrop-blur border-b border-gray-200 dark:border-dark-border">
          <span className="text-sm text-gray-500 dark:text-dark-muted">
            Snowcore Contract Manufacturing
          </span>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
