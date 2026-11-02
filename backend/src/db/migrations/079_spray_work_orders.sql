-- Migration 079: Spray Work Orders
-- Adds operator role and work order tables for the spraying operation workflow.

-- 1. Extend user roles to include 'operator'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ceo','farm_manager','operation_manager','agronomist','pest_agronomist','worker','operator','intern_student','intern_teacher'));

-- 2. Sequence for human-readable work order numbers
CREATE SEQUENCE IF NOT EXISTS work_order_number_seq START WITH 1;

-- 3. Work order header
CREATE TABLE IF NOT EXISTS spray_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_number INT NOT NULL DEFAULT nextval('work_order_number_seq'),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  application_type VARCHAR(20) NOT NULL DEFAULT 'spray' CHECK (application_type IN ('spray', 'drench')),
  date_issued DATE NOT NULL DEFAULT CURRENT_DATE,
  justification TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','in_progress','completed','approved','rejected')),
  rejection_reason TEXT,
  important_instructions TEXT DEFAULT '1. The above label instruction is followed - The recommended rates are complied.
2. The safe time label instruction is followed.
3. All labourers are wearing all required PPEs (Overall, Respiratory, Safety boots, Goggles/face shield and rubber gloves).
4. Uniform walking/driving speed is followed and full canopy is covered/spot treatment is done as per the instruction.
5. Empty containers, hoses covered and caps are put on for storage.
6. The tankers, hoses, filters and nozzles are checked for appropriateness/applicability and are used for operation.
7. PPEs, spray machines are cleaned and stored in the designated storage area.
8. Containers are triple rinsed and returned or stored in the designated storage area.',
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  organization_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swo_site ON spray_work_orders(site_id);
CREATE INDEX IF NOT EXISTS idx_swo_status ON spray_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_swo_assigned ON spray_work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_swo_issued_by ON spray_work_orders(issued_by);

-- 4. Work order line items (one per field+product)
CREATE TABLE IF NOT EXISTS spray_work_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES spray_work_orders(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
  segment VARCHAR(100),
  product_id UUID REFERENCES pesticide_products(id) ON DELETE SET NULL,
  rate VARCHAR(50),
  date_of_application DATE,
  phi_days INT DEFAULT 0,
  group_id UUID,
  is_mixture_child BOOLEAN NOT NULL DEFAULT FALSE,
  -- Operator-filled fields
  start_time TIME,
  end_time TIME,
  total_product_qty NUMERIC(12,2),
  total_water_qty NUMERIC(12,2),
  actual_qty NUMERIC(12,2),
  machinery_ref VARCHAR(100),
  quality_check BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swoi_wo ON spray_work_order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_swoi_field ON spray_work_order_items(field_id);
CREATE INDEX IF NOT EXISTS idx_swoi_group ON spray_work_order_items(group_id);
