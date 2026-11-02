-- Migration 078: Ensure training modules are seeded
-- 077 created the tables but the seed INSERT may not have run if the migration
-- was already tracked before the seed data was added to the file.

INSERT INTO training_modules (title, description, sort_order, icon)
SELECT v.title, v.description, v.sort_order, v.icon
FROM (VALUES
  ('Fertigation Management',
   'Fertiliser calculation for fertigation programmes, acid dosing, pH correction, chemical compatibility, safety precautions, and correct mixing sequences.',
   1, 'Science'),
  ('Harvest Operations',
   'Harvest techniques per crop type, post-harvest handling from field to packhouse, PHI compliance, optimum timing indicators, and grading standards.',
   2, 'Agriculture'),
  ('Integrated Pest Management (IPM)',
   'Safety and PPE, pest and disease biology, application procedures, global audit standards, trapping methods, biological control agents, bumblebee pollination, and systematic scouting.',
   3, 'BugReport'),
  ('EC & pH Monitoring',
   'Measurement techniques for EC and pH in irrigation water and substrate, drainage percentage calculation, diagnosing crop problems, corrective actions, and crop-specific target ranges.',
   4, 'Opacity'),
  ('Packhouse Operations',
   'Sanitation protocols, food safety rules, packaging procedures (grading, weighing, labelling), Brix testing, logistics flow, cold chain management, and temperature/humidity requirements.',
   5, 'Inventory2'),
  ('Farm Maintenance',
   'Identifying and repairing irrigation leaks, nozzle and dripper maintenance, maintaining clean work areas, tool storage, and equipment sanitation procedures.',
   6, 'Build')
) AS v(title, description, sort_order, icon)
WHERE NOT EXISTS (SELECT 1 FROM training_modules LIMIT 1);
