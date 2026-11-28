# قوائم الموقع في بيانات الشركة

نصوص الواجهة وترتيب القوائم من المرفق `admin_divisions.json` المحفوظ في `src/data/adminDivisions.json` داخل حزمة المنصة. روجعت المراجع الرسمية في 28 نوفمبر 2026.

| الدولة | المستوى والعدد | المرجع الرسمي |
|---|---|---|
| مصر | 27 محافظة | [الهيئة العامة للاستعلامات، معلومات أساسية عن مصر](https://sis.gov.eg/ar/%D9%85%D8%B5%D8%B1/%D9%85%D8%B9%D9%84%D9%88%D9%85%D8%A7%D8%AA-%D8%A3%D8%B3%D8%A7%D8%B3%D9%8A%D8%A9/) |
| السعودية | 13 منطقة | [وزارة الداخلية، دليل إمارات المناطق](https://www.moi.gov.sa/wps/wcm/connect/93d643e4-43a1-4a0a-8303-4ad30e059448/MOI.pdf?CVID=nriJ9rL&MOD=AJPERES)، [الهيئة العامة للإحصاء، التغطية الجغرافية](https://www.stats.gov.sa/documents/20117/1993170/economic_indicators_q1_2019.pdf/6b5ff4f9-e2a2-2137-8541-8084faa6e0c0?t=1735137072407) |
| الإمارات | 7 إمارات | [البوابة الرسمية لحكومة الإمارات، الإمارات السبع](https://u.ae/ar/about-the-uae/the-seven-emirates) |
| الكويت | 6 محافظات | [الناشر الرسمي، الإدارة المركزية للإحصاء، التقسيم الإداري للكويت](https://gis.csb.gov.kw/media/pdf/1_Chapter1_Administrative_Division_of_Kuwait.pdf) |
| قطر | 8 بلديات | [وزارة البلدية، المخطط الوطني الشامل ومخطط البلديات](https://www.mm.gov.qa/QatarMasterPlan/Arabic/MSDP-municipalities.aspx?panel=about) |
| البحرين | 4 محافظات | [البوابة الوطنية لمملكة البحرين، عن البحرين](https://www.bahrain.bh/wps/portal/ar/BNP/HomeNationalPortal/ContentDetailsPage/%21ut/p/z0/jc_NbsIwEATgVwmHnL1JmigcA0VQVJSCyk99iRzqBBfHa2zH6uM3VPSCqqrHWa3m0xBKDoQq5kXLnEDF5JDfaFZFTyks8inAy-NDDOvdeJNNVhGs5glZEjo8LErIojiPl2UyS6Aonyfr7esOiji-NoiPy4UWhB5ROf7pyIG36DUax2TFVQgNouMmBK6ZceIo9LcegjbcC-xtoFFKe0_lyfZKZdPNeAbRHNL_UHVvheLWhtBb3vQyEKpB091AoTy3ruPK3bA_hv-G1UpXbBjCauxd4E48OAvVvmP3c6rZyTCh7iLRZ1qn0nf7YjT6ArLmDsk%21/) |
| الأردن | 12 محافظة | [وزارة الداخلية، المحافظات والمراكز الإدارية](https://moi.gov.jo/Ar/List/%D8%A7%D9%84%D9%85%D8%AD%D8%A7%D9%81%D8%B8%D8%A7%D8%AA_%D9%88%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D9%83%D8%B2_%D8%A7%D9%84%D8%A5%D8%AF%D8%A7%D8%B1%D9%8A%D8%A9) |
| المغرب | 12 جهة | [المندوبية السامية للتخطيط، توزيع السكان حسب الجهات لسنة 2024](https://www.hcp.ma/file/244257/) |

- وفق ملاحظة المهمة، استُكملت قائمة مصر في المرفق بمحافظة السويس بعد أن أسقطها مصدر الاستخراج. المرجع الرسمي يذكر السويس ويثبت أن العدد 27. [الهيئة العامة للاستعلامات](https://sis.gov.eg/ar/%D9%85%D8%B5%D8%B1/%D9%85%D8%B9%D9%84%D9%88%D9%85%D8%A7%D8%AA-%D8%A3%D8%B3%D8%A7%D8%B3%D9%8A%D8%A9/)
- تبقى «المدينة» كتابة حرة في تونس لأن البيانات المتاحة للمهمة تخص الأقاليم بدل الولايات، وفي ليبيا لأن البيانات المتاحة غير مؤكدة. وينطبق الحقل الحر أيضًا عند اختيار «أخرى» أو قبل اختيار البلد.

## الجلسات السابقة وقراءة الموقع

تسترجع صفحة بيانات الشركة البلد وقيمة `city` من الجلسة المحفوظة. إذا وافقت القيمة القديمة عنصرًا في القائمة يُعرض هذا العنصر محددًا. وإذا كانت نصًا خارج القائمة تظهر محددةً كخيار قديم غير متاح للاختيار من جديد. تغيير البلد يمسح الحقل، واختيار عنصر جديد يحفظ نصه في `city` بالحفظ المعتاد.

| الموضع | استخدام قيمة مثل «منطقة الرياض» |
|---|---|
| `appConfig.ts` | يضم نص الموقع إلى رسالة واتساب التنفيذية. |
| `valueModule/prefill.ts` | يعرضه ضمن سياق الشركة النصي في الحاسبة. |
| `dualLayerReport.ts` | يقرأه من بيانات الشركة أو الاستبيان ويعرضه في التقرير وملف واتساب. |
| `chatPolicy.ts` | يبني سياق المحادثة من الحقول المسموح بها ويستبعد الموقع. |
| `api.ts` | يقبل `city` نصًا اختياريًا في عقد التواصل. دالة التواصل الحالية تعيد حالة `session_only`. |
