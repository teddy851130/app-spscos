'use client';

import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Pipeline from './components/Pipeline';
import Buyers from './components/Buyers';
import Emails from './components/Emails';
import KPIReport from './components/KPIReport';
import Domain from './components/Domain';

export default function Home() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  return (
    <div className="flex h-screen bg-[#0f172a] text-[#f1f5f9]">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'pipeline' && <Pipeline />}
        {currentPage === 'buyers' && <Buyers />}
        {currentPage === 'emails' && <Emails />}
        {currentPage === 'kpi' && <KPIReport />}
        {currentPage === 'domain' && <Domain />}
      </main>
    </div>
  );
}
