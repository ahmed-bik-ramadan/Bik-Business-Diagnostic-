import React, { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { buildConsultantWhatsAppUrl } from '../config/appConfig';
import { dialectForCountry } from '../services/dialect';
import { listForConsultant, type PathwayCardContent, type PathwayGroup } from './engine';

function ConsultantPathwayCard({ pathway }: { pathway: PathwayCardContent }) {
  const { id, ownerPhrase, meaning, action, serviceName } = pathway;
  const { url } = buildConsultantWhatsAppUrl({
    customMessage: `مرحباً أستاذ أحمد، أرغب في مناقشة حالة: «${ownerPhrase}» ضمن ${serviceName}.`,
  });

  return (
    <article data-pathway-id={id} className="flex min-w-0 flex-col rounded-2xl border border-[#0F172A]/10 bg-white p-4 md:p-5">
      <h3 className="break-words font-bold leading-7">{ownerPhrase}</h3>
      <p className="mt-3 text-xs font-bold text-[#6B5620]">ما يدل عليه عادةً</p>
      <p className="mt-1 break-words text-sm leading-7 text-[#26354E]">{meaning}</p>
      <p className="mt-3 text-xs font-bold text-[#6B5620]">ما نفعله</p>
      <p className="mt-1 break-words text-sm leading-7 text-[#26354E]">{action}</p>
      <p className="mt-auto pt-4 text-sm font-bold">{serviceName}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center self-start rounded-xl bg-[#EADDBB] px-4 py-2 text-sm font-bold hover:bg-[#F6F0DF]">
          ناقش هذه الحالة مع أحمد
        </a>
      )}
    </article>
  );
}

export default function ConsultantPathways({ country }: { country?: unknown }) {
  const dialect = dialectForCountry(country);
  const headingId = useId();
  const [groups, setGroups] = useState<PathwayGroup[]>([]);

  useEffect(() => {
    let active = true;
    setGroups([]);
    listForConsultant(dialect)
      .then(result => { if (active) setGroups(result); })
      .catch(() => { if (active) setGroups([]); });
    return () => { active = false; };
  }, [dialect]);

  if (groups.length === 0) return null;

  return (
    <section className="bkc-sec" dir="rtl" aria-labelledby={headingId}>
      <div className="bkc-wrap">
        <h2 id={headingId}>ما الذي يقلقك في شركتك؟</h2>
        <p className="bkc-sub">اختر العبارة الأقرب إلى حالتك، وتعرف ما يدل عليه عادةً وما نفعله.</p>
        <div className="mt-5 space-y-3">
          {groups.map(({ axis, title, pathways }) => {
            const empty = pathways.length === 0;
            return (
              <details key={axis} data-pathway-axis={axis}
                className="group rounded-2xl border border-[#0F172A]/10 bg-[#FBFAF6]">
                <summary aria-disabled={empty || undefined} onClick={empty ? event => event.preventDefault() : undefined}
                  className={`flex min-h-12 list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 font-bold [&::-webkit-details-marker]:hidden ${empty ? 'text-[#526B7B]' : 'cursor-pointer'}`}>
                  {title}
                  {!empty && <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />}
                </summary>
                {!empty && <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 md:px-4 md:pb-4">
                  {pathways.map(pathway => <ConsultantPathwayCard key={pathway.id} pathway={pathway} />)}
                </div>}
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
