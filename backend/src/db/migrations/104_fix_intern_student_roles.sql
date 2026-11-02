-- Correct internship student roles for enrolled students mislabeled in User Management
UPDATE users
SET role = 'intern_student', updated_at = NOW()
WHERE email IN (
  'student2@gmail.com',
  'mubarak@elite.com',
  'theyab@elite.com',
  'saoud@elite.com',
  'hsk@elite.com',
  'saif@elite.com',
  'salem@elite.com'
)
AND role != 'intern_teacher';
