import React, { useMemo } from 'react';
import ConsultantPage, { setConsultantWhatsApp } from './consultant/ConsultantPage';
import { APP_CONFIG } from '../config/appConfig';
import { sectors } from '../data/sectors';
import { useDiagnosticStore } from '../store/diagnosticStore';

setConsultantWhatsApp(APP_CONFIG.consultantWhatsApp);

/**
 * صفحة المستشار المعتمدة. إن أكمل الزائر مدخل الشركة تُمرَّر بياناته الأولية (الاسم، الشركة، القطاع، الدولة)
 * فلا يُسأل عنها مرة أخرى، وتدخل في نص رسالة واتساب الذي يرسله بنفسه.
 */
const Consultant: React.FC = () => {
  const { userName, companyName, sectorL1, intakeAnswers } = useDiagnosticStore();
  const visitor = useMemo(() => {
    const name = (userName || '').trim();
    if (!name) return undefined;
    const sector = sectors.find((s) => s.id === sectorL1)?.label || '';
    const country = typeof intakeAnswers?.country === 'string' ? intakeAnswers.country.trim() : '';
    return { name, company: (companyName || '').trim(), sector, country };
  }, [userName, companyName, sectorL1, intakeAnswers]);

  return <ConsultantPage visitor={visitor} country={intakeAnswers?.country} />;
};

export default Consultant;
