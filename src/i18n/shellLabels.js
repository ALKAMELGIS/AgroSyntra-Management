import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Arabic labels for the app shell: navigation areas, sidebar sections and
 * items, hub tiles, breadcrumbs, phone bar and account menu.
 * Keys are the English labels used in config/navAreas.js and pages/Home.js,
 * so adding a page only needs one line here.
 */
export const SHELL_AR = {
  // Areas & sections
  Operations: 'العمليات',
  IPM: 'المكافحة المتكاملة',
  'Field & Maps': 'الحقول والخرائط',
  Reports: 'التقارير',
  Workforce: 'القوى العاملة',
  Settings: 'الإعدادات',
  GENERAL: 'عام',
  General: 'عام',
  'DATA ENTRY': 'إدخال البيانات',
  'Data Entry': 'إدخال البيانات',
  DASHBOARDS: 'لوحات المؤشرات',
  Dashboards: 'لوحات المؤشرات',
  REPORTS: 'التقارير',
  'FIELD & WEATHER': 'الحقل والطقس',
  'Field & Weather': 'الحقل والطقس',
  AUDIT: 'التدقيق',
  Audit: 'التدقيق',
  'IPM CONTROL': 'مكافحة الآفات',
  'IPM Control': 'مكافحة الآفات',
  WORKFORCE: 'القوى العاملة',
  MANAGEMENT: 'الإدارة',
  Management: 'الإدارة',
  INTERNSHIP: 'التدريب',
  Internship: 'التدريب',
  ADMIN: 'الإدارة العامة',
  Admin: 'الإدارة العامة',
  Core: 'الأساسيات',
  'IPM / Crop Protection': 'وقاية المحاصيل',
  'Reports & Dashboards': 'التقارير ولوحات المؤشرات',

  // Pages
  Home: 'الرئيسية',
  'Summary & Contents': 'الملخص والمحتويات',
  'Daily Brief': 'الموجز اليومي',
  'AI Assistant': 'المساعد الذكي',
  Overview: 'نظرة عامة',
  Dashboard: 'لوحة التحليلات',
  'Analytics Dashboard': 'لوحة التحليلات',
  Notifications: 'الإشعارات',
  Templates: 'القوالب',
  'EC/PH Entry': 'إدخال EC/pH',
  'EC/pH Entry': 'إدخال EC/pH',
  'Fertigation Entry': 'إدخال التسميد',
  'Irrigation Entry': 'إدخال الري',
  'Harvest Entry': 'إدخال الحصاد',
  'Crop Rotation': 'الدورة الزراعية',
  'Farm Areas & Crops': 'مناطق المزرعة والمحاصيل',
  'Field Types & Names': 'أنواع الحقول وأسماؤها',
  'Valves Config': 'إعداد المحابس',
  'Historical Import': 'استيراد البيانات السابقة',
  'Pump Room': 'غرفة المضخات',
  Recipes: 'الوصفات',
  Inventory: 'المخزون',
  'GPS Tracking': 'تتبع GPS',
  Recovery: 'الاستعادة',
  Harvest: 'الحصاد',
  Fertigation: 'التسميد',
  Irrigation: 'الري',
  Efficiency: 'الكفاءة',
  'Fert vs Harvest': 'التسميد مقابل الحصاد',
  'Harvest Dashboard': 'لوحة الحصاد',
  'Fertigation Dashboard': 'لوحة التسميد',
  'EC/PH Reports': 'تقارير EC/pH',
  'Fertigation Reports': 'تقارير التسميد',
  'Harvest Reports': 'تقارير الحصاد',
  'Report Builder': 'منشئ التقارير',
  'Weather Entry': 'إدخال الطقس',
  'Weather Map': 'خريطة الطقس',
  'Remote Sensing': 'الاستشعار عن بعد',
  'GIS Map': 'خريطة GIS',
  'Batch Trace': 'تتبع الدفعات',
  'PHI Audit Log': 'سجل تدقيق فترة ما قبل الحصاد',
  'Change Requests': 'طلبات التعديل',
  'Pesticide Applications': 'تطبيقات المبيدات',
  'Biological Control': 'المكافحة الحيوية',
  'Bumble Bees': 'النحل الطنان',
  'Product Catalog': 'دليل المنتجات',
  'Scouting Reports': 'تقارير الكشف',
  'Pest Catalog': 'دليل الآفات',
  'Spray Calendar': 'تقويم الرش',
  'Field Staff': 'العاملون الميدانيون',
  Tasks: 'المهام',
  'Shift Schedule': 'جدول المناوبات',
  'Manpower Record': 'سجل العمالة',
  'Manpower Cost': 'تكلفة العمالة',
  'Daily Activity Sheet': 'ورقة النشاط اليومي',
  Organization: 'المنظمة',
  'Platform Admin': 'إدارة المنصة',
  Enrollment: 'التسجيل',
  'Zones & Sites': 'المناطق والمواقع',
  Seasons: 'المواسم',
  'Yield Predictions': 'توقعات الإنتاج',
  'Agronomic Reference': 'المرجع الزراعي',
  'API Integrations': 'تكاملات API',
  'John Deere': 'John Deere',
  'ArcGIS Link': 'ربط ArcGIS',
  'Training Modules': 'وحدات التدريب',
  'My Grades': 'درجاتي',
  'User Management': 'إدارة المستخدمين',
  'Audit Log': 'سجل التدقيق',
  'Data Backup': 'النسخ الاحتياطي',
  'System Health': 'حالة النظام',
  'API Keys': 'مفاتيح API',
  Webhooks: 'Webhooks',
  'Feature Flags': 'خصائص التجربة',

  // Shell chrome
  Modules: 'الوحدات',
  Search: 'بحث',
  Alerts: 'التنبيهات',
  Menu: 'القائمة',
  'Search data…': 'ابحث في البيانات…',
  'Continue where you left off': 'تابع من حيث توقفت',
  'Everything happening across your fields today, one tap away.': 'كل ما يحدث في حقولك اليوم، على بُعد لمسة واحدة.',
  'choose a module': 'اختر وحدة',
  'Good morning': 'صباح الخير',
  'Good afternoon': 'مساء الخير',
  'Good evening': 'مساء الخير',
  'Light Mode': 'الوضع الفاتح',
  'Dark Mode': 'الوضع الداكن',
  'System Theme': 'حسب الجهاز',
  Language: 'اللغة',
  'Sign out': 'تسجيل الخروج',
  'Elite Agro Cloud': 'إيليت أجرو كلاود',
  'Al Maha Farm': 'مزرعة المها',
  'Skip to content': 'انتقل إلى المحتوى',
};

/** Returns a function that maps a shell label to the current language. */
export function useShellLabel() {
  const { i18n } = useTranslation();
  const ar = (i18n.language || '').startsWith('ar');
  return useCallback((label) => {
    if (!ar || !label) return label;
    if (SHELL_AR[label]) return SHELL_AR[label];
    const upper = SHELL_AR[label.toUpperCase()];
    return upper || label;
  }, [ar]);
}

export function useIsArabic() {
  const { i18n } = useTranslation();
  return (i18n.language || '').startsWith('ar');
}
