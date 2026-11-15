# الدليل المعماري للمنصة المستضافة ذاتياً (Architecture Specification)

## 1. الرؤية والمعمارية العامة (Architecture Overview)
تم تصميم المعمارية الجديدة لمنصة **BIK** بحيث تضمن **الاستقلالية التامة والسيادة الكاملة على البيانات (Data Sovereignty)**، وفق القرارات المعمارية المعتمدة:
1. **قاعدة بيانات PostgreSQL ذاتية الاستضافة (Self-Hosted PostgreSQL):** لا اشتراك أو اتصال بخدمات قواعد بيانات سحابية خارجية (لا Supabase، ولا Firebase، ولا خدمات خارجية).
2. **بوابة واجهات برمجية خاصة (Custom Backend API):** كافة عمليات الحفظ والقراءة والمصادقة تجري عبر خادم Express المحمي، دون أي وصول مباشر من المتصفح إلى قاعدة البيانات.
3. **أولوية الجلسة على العميل (Session-Centric Model):** الجلسة التشخيصية والتقرير هما الكيان الأساسي في النظام، وتقديم بيانات العميل (Lead) اختياري وتدريجي.
4. **تشفير وعزل الأمان (Defense in Depth):** جلسات الإدارة عبر ملفات تعريف ارتباط آمنة (`HttpOnly, Secure, SameSite`)، وتشفير كلمات المرور بـ `bcrypt` (12 جولة تمليح)، ومقاومة هجمات التخمين بتعليق الحساب بعد 5 محاولات فاشلة، وسجل تدقيق شامل.
5. **طبقة عزل الخصوصية لـ Gemini و WhatsApp:** عزل كافة معرّفات الهوية الشخصية (الاسم، الهاتف، الشركة) عن نماذج الذكاء الاصطناعي، وإلغاء إرسال تفاصيل الإجابات (`full_transcript`) عبر WhatsApp.

---

## 2. هيكل البيانات ومخطط الجداول (PostgreSQL Relational Schema)

المخطط منشور في ملف التهيئة والتحديث `migrations/001_initial_schema.sql` ويتضمن 8 جداول مترابطة:

### 2.1. جدول المستخدمين الإداريين (`admin_users`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | المعرف الفريد للمسؤول |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | اسم المستخدم |
| `password_hash` | VARCHAR(255) | NOT NULL | هاش كلمة المرور المشفر عبر bcrypt |
| `role` | VARCHAR(20) | NOT NULL | الصلاحية (`superadmin`, `editor`, `viewer`) |
| `created_at` | TIMESTAMPTZ | NOT NULL | تاريخ الإنشاء |
| `updated_at` | TIMESTAMPTZ | NOT NULL | تاريخ آخر تحديث |

### 2.2. جدول الجلسات التشخيصية (`diagnostic_sessions`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `session_id` | UUID | PRIMARY KEY | المعرف الأساسي للجلسة التشخيصية |
| `ownership_hash` | VARCHAR(128) | NOT NULL | هاش SHA-256 لرمز ملكية الجلسة للعميل |
| `sector_l1` | VARCHAR(100) | NULL | القطاع الرئيسي |
| `sector_l2` | VARCHAR(100) | NULL | القطاع الفرعي |
| `diagnostic_depth` | VARCHAR(20) | DEFAULT 'quick' | عمق التشخيص (`quick` أو `deep`) |
| `intake_answers` | JSONB | NOT NULL | إجابات مرحلة الدخول وتأسيس النشاط |
| `universal_answers` | JSONB | NOT NULL | إجابات المحاور العامة |
| `sector_answers` | JSONB | NOT NULL | إجابات المحاور القطاعية |
| `status` | VARCHAR(20) | NOT NULL | حالة الجلسة (`in_progress`, `completed`) |
| `created_at` | TIMESTAMPTZ | NOT NULL | تاريخ بدء الجلسة |
| `updated_at` | TIMESTAMPTZ | NOT NULL | تاريخ آخر تعديل |

### 2.3. جدول التقارير الاستراتيجية (`diagnostic_reports`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | المعرف الفريد للتقرير |
| `session_id` | UUID | UNIQUE, NOT NULL, FK | المفتاح الأجنبي المرتبط بجلسة التشخيص (1:1) |
| `overall_score` | INT | CHECK (0-100) | النتيجة الحسابية المحددة للنشاط |
| `health_label` | VARCHAR(50) | NOT NULL | تصنيف الصحة (ممتاز، جيد، متوسط، ضعيف) |
| `headline_diagnosis` | TEXT | NOT NULL | التشخيص المبدئي المكثف |
| `axis_scores` | JSONB | NOT NULL | درجات المحاور الستة |
| `axis_details` | JSONB | NOT NULL | تفاصيل مؤشرات الأدلة والفجوات |
| `swot_matrix` | JSONB | NOT NULL | مصفوفة التحليل الاستراتيجي الرباعي |
| `blind_spots` | JSONB | NOT NULL | النقاط العمياء الثلاث المرصودة |
| `priority_actions` | JSONB | NOT NULL | إجراءات الأولوية الخمسة |
| `closing_question` | TEXT | NULL | السؤال الاستراتيجي الختامي |
| `sector_insight` | TEXT | NULL | الرؤية الاستشرافية لقطاع الأعمال |
| `created_at` | TIMESTAMPTZ | NOT NULL | تاريخ توليد التقرير |

### 2.4. جدول العملاء المحتملين (`leads`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | المعرف الفريد للعميل |
| `session_id` | UUID | UNIQUE, NULL, FK | مفتاح أجنبي اختياري مرتبط بالجلسة |
| `name` | VARCHAR(150) | NOT NULL | اسم صاحب النشاط |
| `company_name` | VARCHAR(150) | NOT NULL | اسم المنشأة أو الشركة |
| `whatsapp_number` | VARCHAR(30) | NOT NULL | رقم الواتساب بالصيغة الدولية |
| `sector_l1` | VARCHAR(100) | NULL | القطاع الأساسي |
| `sector_l2` | VARCHAR(100) | NULL | القطاع المتخصص |
| `country` | VARCHAR(100) | NULL | الدولة |
| `city` | VARCHAR(100) | NULL | المدينة |
| `status` | VARCHAR(30) | DEFAULT 'new' | حالة المتابعة (`new`, `contacted`, `in_progress`, `closed`, `archived`) |
| `proposal_text` | TEXT | NULL | نص المقترح أو العرض الاستشاري |
| `created_at` | TIMESTAMPTZ | NOT NULL | تاريخ التسجيل |
| `updated_at` | TIMESTAMPTZ | NOT NULL | تاريخ آخر تحديث |

### 2.5. جدول موافقات الخصوصية (`privacy_consents`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | المعرف الفريد للموافقة |
| `lead_id` | UUID | NOT NULL, FK | معرف العميل المرتبط |
| `consented` | BOOLEAN | NOT NULL (TRUE) | إقرار الموافقة الصريحة |
| `purpose` | TEXT | NOT NULL | الغرض المعتمد للموافقة |
| `ip_address` | VARCHAR(45) | NULL | عنوان IP المسجل للتوثيق |
| `consented_at` | TIMESTAMPTZ | NOT NULL | وقت وتاريخ تسجيل الموافقة |

### 2.6. جدول جلسات الإدارة الموثوقة (`admin_sessions`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `token_hash` | VARCHAR(64) | PRIMARY KEY | هاش SHA-256 للرمز العشوائي المرسل للمسؤول |
| `user_id` | UUID | NOT NULL, FK | معرف المسؤول |
| `created_at` | TIMESTAMPTZ | NOT NULL | وقت إصدار الجلسة |
| `expires_at` | TIMESTAMPTZ | NOT NULL | تاريخ انتهاء الجلسة (8 ساعات كحد أقصى) |

### 2.7. جدول ملاحظات الفريق الاستشاري (`admin_notes`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | المعرف الفريد للملاحظة |
| `lead_id` | UUID | NOT NULL, FK | معرف العميل |
| `author_id` | UUID | NULL, FK | معرف كاتب الملاحظة |
| `author_name` | VARCHAR(100) | NULL | اسم كاتب الملاحظة |
| `note_text` | TEXT | NOT NULL | نص الملاحظة الاستشارية |
| `created_at` | TIMESTAMPTZ | NOT NULL | تاريخ الملاحظة |

### 2.8. جدول سجل تغيير الحالات (`lead_status_history`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY | معرف السجل |
| `lead_id` | UUID | NOT NULL, FK | معرف العميل |
| `changed_by` | UUID | NULL, FK | معرف الموظف الذي أجرى التغيير |
| `changed_by_name` | VARCHAR(100) | NULL | اسم المسؤول |
| `old_status` | VARCHAR(30) | NULL | الحالة السابقة |
| `new_status` | VARCHAR(30) | NOT NULL | الحالة الجديدة |
| `changed_at` | TIMESTAMPTZ | NOT NULL | وقت التغيير |

### 2.9. جدول سجل التدقيق الأمني (`admin_audit_logs`)
| الحقل | النوع | الخصائص | الوصف |
| :--- | :--- | :--- | :--- |
| `id` | BIGSERIAL | PRIMARY KEY | الترقيم التسلسلي |
| `user_id` | UUID | NULL | معرف المستخدم إن وجد |
| `username_attempted` | VARCHAR(50) | NULL | اسم المستخدم المدخل |
| `ip_address` | VARCHAR(45) | NULL | عنوان IP |
| `action_type` | VARCHAR(50) | NOT NULL | نوع الإجراء (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LEAD_DELETE`) |
| `details` | TEXT | NULL | تفاصيل إضافية عن العملية |
| `created_at` | TIMESTAMPTZ | NOT NULL | وقت تسجيل الحدث |

---

## 3. تصميم واجهات التطبيق البرمجية (REST API v1 Suite)

| المسار (Endpoint) | الطريقة (Method) | الصلاحية (Auth) | الوصف |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | GET | عام | فحص حالة الخادم ونمط التخزين النشط |
| `/api/v1/sessions/start` | POST | عام | بدء جلسة جديدة وتوليد رمز الملكية المشفر |
| `/api/v1/sessions/answers` | POST | ملكية الجلسة | حفظ تراكمي فوري لإجابات الأسئلة في الجلسة |
| `/api/v1/diagnose/generate` | POST | ملكية الجلسة | توليد التقرير الاستراتيجي وحفظه (مجهول الهوية) |
| `/api/v1/leads/submit` | POST | عام/جلسة | تسجيل بيانات العميل اختياريًا مع إقرار الخصوصية |
| `/api/v1/admin/auth/login` | POST | عام (محدد بالمعدل) | مصادقة الإدارة عبر bcrypt وتعيين HttpOnly cookie |
| `/api/v1/admin/auth/logout` | POST | إدارة | إنهاء جلسة الإدارة ومسح ملف التعريف |
| `/api/v1/admin/me` | GET | إدارة | قراءة الملف الشخصي للمسؤول الحالي |
| `/api/v1/admin/leads` | GET | إدارة (الكل) | جلب قائمة العملاء مع الفلاتر والتقارير المرتبطة |
| `/api/v1/admin/leads/:id` | GET | إدارة (الكل) | جلب تفاصيل عميل بالكامل مع الملاحظات والتقرير |
| `/api/v1/admin/leads/:id/status` | PUT | محرر / مشرف عام | تحديث حالة العميل وتسجيل التغيير في السجل |
| `/api/v1/admin/leads/:id/notes` | POST | محرر / مشرف عام | إضافة ملاحظة استشارية على العميل |
| `/api/v1/admin/leads/:id/proposal` | POST | محرر / مشرف عام | حفظ مقترح أو عرض استشاري خاص بالعميل |
| `/api/v1/admin/leads/:id` | DELETE | مشرف عام فقط | حذف العميل وسجلاته بالكامل مع قيد أمني |

---

## 4. نموذج عزل البيانات والذكاء الاصطناعي (Gemini Isolation)
- **منع تسريب الهوية:** لا يصل إلى Gemini اسم العميل أو اسم شركته أو رقم هاتفه أو بريده الإلكتروني مطلقاً.
- **البيانات المسموحة للتحليل فقط:** القطاع (L1 & L2)، سنة التأسيس، حجم الفريق، وإجابات الأسئلة التشخيصية.
- **التطهير الحتمي:** تحسب درجات المؤشرات ومحاور التقييم الستة بالكامل برمجياً عبر خوارزمية `computeInstantScore` المحددة بدقة (Deterministic Scoring) ولا تترك لتخمين الذكاء الاصطناعي.
- **تطهير الأطر:** يتم تنظيف مخرجات Gemini لإزالة أي مصطلحات نظرية أو أكاديمية أجنبية (مثل SWOT، Porter، McKinsey، Hormozi) واستبدالها بمصطلحات عربية احترافية.

---

## 5. مرونة التشغيل والتخزين الاحتياطي (Graceful Degradation)
- في حال انقطاع الاتصال بقاعدة PostgreSQL أو تشغيل التطبيق في بيئة معزولة دون متغير `DATABASE_URL` نشط، يتحول النظام آلياً إلى طبقة التخزين المحلي الآمن (`local_fallback`) في `data/local_db.json`.
- تضمن هذه الطبقة عدم توقف التطبيق أو شاشة التقرير إطلاقاً، وتمنح المستخدم تقريره الفوري مع إشعار بنمط التخزين.
