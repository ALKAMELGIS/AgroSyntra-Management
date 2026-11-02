-- Fix manpower template route_path to match actual frontend route
UPDATE form_templates SET route_path = '/manpower-record' WHERE slug = 'manpower-entry' AND route_path = '/manpower/record';
