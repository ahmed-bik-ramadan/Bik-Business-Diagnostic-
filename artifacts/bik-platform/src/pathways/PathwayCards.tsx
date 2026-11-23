import React, { useId } from 'react';
import type { PathwayCardContent } from './engine';

export default function PathwayCards({ pathways }: { pathways: readonly PathwayCardContent[] }) {
  const headingId = useId();
  if (pathways.length === 0) return null;

  return (
    <section dir="rtl" aria-labelledby={headingId}
      className="rounded-[1.7rem] border border-[#0F172A]/10 bg-[#FBFAF6] p-5 md:p-8">
      <h2 id={headingId} className="font-display text-2xl font-bold">ما يظهر في المحورين الأضعف</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {pathways.map(({ id, headline, meaning, action }) => (
          <article key={id} data-pathway-id={id} className="min-w-0 rounded-2xl border border-[#0F172A]/10 bg-white p-4 md:p-5">
            <h3 className="font-bold leading-7">{headline}</h3>
            <p className="mt-2 break-words text-sm leading-7 text-[#26354E]">{meaning}</p>
            <p className="mt-4 text-xs font-bold text-[#6B5620]">ما نفعله</p>
            <p className="mt-1 break-words text-sm leading-7 text-[#26354E]">{action}</p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-sm leading-7 text-[#26354E]">هذه فرضيات نفحصها معك، وليست أحكاماً على شركتك.</p>
    </section>
  );
}
