import React, { useEffect, useId, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LegalPageProps {
  title: string;
  sections: readonly (readonly [heading: string, content: string])[];
}

export default function LegalPage({ title, sections }: LegalPageProps) {
  const pageRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <main ref={pageRef} tabIndex={-1} aria-labelledby={titleId} dir="rtl" lang="ar"
      className="min-h-screen bg-[#F4F1E9] px-4 py-8 text-[#0F172A] focus:outline-none md:py-14">
      <article className="mx-auto max-w-2xl rounded-2xl border border-[#C9A961]/35 bg-white p-5 md:p-8">
        <Link to="/" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#526B7B] underline underline-offset-4 hover:text-[#0F172A]">
          <ArrowRight size={16} aria-hidden="true" /> صفحة الترحيب
        </Link>
        <h1 id={titleId} className="font-display text-3xl font-bold md:text-4xl">{title}</h1>
        <div className="mt-6 divide-y divide-[#0F172A]/10">
          {sections.map(([heading, content]) => (
            <section key={heading} className="py-4 first:pt-0 last:pb-0">
              <h2 className="text-lg font-bold">{heading}</h2>
              <p className="mt-2 leading-8 text-[#26354E]">{content}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
