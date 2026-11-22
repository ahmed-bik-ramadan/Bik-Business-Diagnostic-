import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const link = 'inline-flex min-h-11 items-center underline underline-offset-4';

  return (
    <footer className="border-t border-[#0F172A]/10 bg-[#FBFAF6] text-[#26354E]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-5 py-3 text-sm md:px-10">
        <p dir="ltr" lang="en" className="font-bold">BIK Business Solutions</p>
        <nav className="flex flex-wrap gap-x-5">
          <Link to="/privacy" className={link}>سياسة الخصوصية</Link>
          <Link to="/terms" className={link}>الشروط</Link>
        </nav>
      </div>
    </footer>
  );
}
