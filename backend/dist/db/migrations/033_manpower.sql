-- Migration 033: Manpower tracking system
-- Tables: crop_varieties, workers, manpower_activities, manpower_records
-- Also adds variety_id to fields table

-- ─── Crop Varieties ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crop_varieties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id UUID REFERENCES crops(id),
  name VARCHAR(200) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crop_varieties_crop ON crop_varieties(crop_id);

-- Add variety_id to fields
ALTER TABLE fields ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);

-- ─── Workers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Casual',
  pin_hash VARCHAR(200),
  is_team_leader BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workers_employee_id ON workers(employee_id);
CREATE INDEX IF NOT EXISTS idx_workers_team_leader ON workers(is_team_leader) WHERE is_team_leader = true;
CREATE INDEX IF NOT EXISTS idx_workers_active ON workers(is_active) WHERE is_active = true;

-- ─── Manpower Activities ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manpower_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  default_unit VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Manpower Records ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manpower_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date DATE NOT NULL,
  worker_id UUID NOT NULL REFERENCES workers(id),
  task_sequence INTEGER NOT NULL DEFAULT 1,
  activity VARCHAR(200) NOT NULL,
  unit VARCHAR(50),
  variety VARCHAR(200),
  location VARCHAR(200),
  valve VARCHAR(100),
  bay VARCHAR(100),
  start_time TIME,
  end_time TIME,
  target NUMERIC,
  actual NUMERIC,
  work_hours NUMERIC,
  overtime NUMERIC DEFAULT 0,
  total_hours NUMERIC,
  submitted_by UUID REFERENCES workers(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manpower_records_date ON manpower_records(record_date);
CREATE INDEX IF NOT EXISTS idx_manpower_records_worker ON manpower_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_manpower_records_submitted ON manpower_records(submitted_by);
CREATE INDEX IF NOT EXISTS idx_manpower_records_date_worker ON manpower_records(record_date, worker_id);

-- ─── Seed: Crop Varieties ───────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM crop_varieties LIMIT 1) THEN
    INSERT INTO crop_varieties (name) VALUES
      ('Sven RZ'), ('Arancia RZ'), ('Marletta F1'), ('Elpida F1'),
      ('SV4129TH'), ('Botero F1'), ('Empres (CLX37373) F1'),
      ('Sweet Corn'), ('Fig'), ('All Crop');
  END IF;
END $$;

-- ─── Seed: Manpower Activities ──────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM manpower_activities LIMIT 1) THEN
    INSERT INTO manpower_activities (name, default_unit) VALUES
      ('Uprooting, Rope Cutting & Plant Arrange', 'Bed'),
      ('Hook Collection & Loading', 'Bed'),
      ('Weeding & Cleaning', 'Bed'),
      ('Micro Drip Removing', 'Bed'),
      ('Root Cleaning', 'Bed'),
      ('Toilet Cleaning', 'Area'),
      ('EC & PH Measuring', 'Ha'),
      ('Supervisor', 'Ha'),
      ('Scouting', 'Ha'),
      ('Irrigation & Other Job Working', 'Ha'),
      ('Harvesting Crates Cleaning', 'Pcs'),
      ('Harvesting Crates/Pallet Arranging', 'Trip'),
      ('Harvesting', 'Box'),
      ('Product loading and transportation', 'Trip'),
      ('Irrigation Operator & fertigation Mixing', 'Ha'),
      ('Water Distribution', 'Ha'),
      ('Operator Manitou', 'Ha'),
      ('Forecasting Harvest', 'Ha'),
      ('Data Entry', 'Ha'),
      ('Transportation', 'Ha'),
      ('Maintenance', 'Ha'),
      ('Cocopit Loading', 'Bed'),
      ('Hook Making', 'Pcs'),
      ('Hook Installation', 'Bed'),
      ('Seeds Sowing', 'Tray'),
      ('Fig Planting', 'Pot'),
      ('Spray Supervisor', 'Bed'),
      ('Spray', 'Bed'),
      ('Irrigation & Plant Checking', 'Ha'),
      ('Side Shoot Trellising', 'Bed'),
      ('Leaf Cleaning', 'Bed'),
      ('Leaf Pruning', 'Bed'),
      ('Lowering', 'Bed'),
      ('Bed Preparation', 'Bed'),
      ('No Work', 'Absent');
  END IF;
END $$;

-- ─── Seed: Workers ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM workers LIMIT 1) THEN
    INSERT INTO workers (employee_id, name, category) VALUES
      ('4427', 'Kittipong Dokjan', 'Permanent'),
      ('4430', 'Chockhai Jeeklang', 'Permanent'),
      ('6005', 'Manop Khunsa', 'Permanent'),
      ('6113', 'Tara Bahadur Rahu', 'Permanent'),
      ('16590', 'Uttam Thapa', 'Permanent'),
      ('6180', 'Laxman Bk', 'Permanent'),
      ('6197', 'Kamal Gaha', 'Permanent'),
      ('7644', 'Dhan B Lingdom', 'Permanent'),
      ('7651', 'Milan K. Subedi', 'Permanent'),
      ('7657', 'Raj B.Subedi', 'Permanent'),
      ('7681', 'Niroj Chuni Magar', 'Permanent'),
      ('7887', 'Ran Bahadur Rai', 'Permanent'),
      ('8823', 'Sanjib Bal', 'Permanent'),
      ('8831', 'Phon Chanabun', 'Permanent'),
      ('8832', 'Shyam Bahadur Basnet', 'Permanent'),
      ('8841', 'Winai Kitiarsa', 'Permanent'),
      ('8853', 'Wik Norsoongnoen', 'Permanent'),
      ('8854', 'Thongsai Thaochali', 'Permanent'),
      ('8980', 'Chan Phutthiwong', 'Permanent'),
      ('9151', 'Thawat Aounlamai', 'Permanent'),
      ('9159', 'Suwit Phaengkhot', 'Permanent'),
      ('15638', 'Raj Kumar Gurung', 'Permanent'),
      ('16416', 'Dipesh Limbu', 'Permanent'),
      ('16420', 'Chandra Sing Tamang', 'Permanent'),
      ('16534', 'Som Bahadur Rai', 'Permanent'),
      ('16993', 'HARDEEP SINGH JASPAL SINGH', 'Permanent'),
      ('6118', 'NAYAN BAHADUR KHAN THAKURI', 'Permanent'),
      ('16783', 'Jaspal Singh Baldev Singh', 'Permanent'),
      ('41018', 'Chudamani Pant', 'Permanent'),
      ('1', 'Bertrand Bigwanya', 'Casual'),
      ('2', 'DAWA DORJE LAMA', 'Casual'),
      ('3', 'MIN BAHADUR SUNAR', 'Casual'),
      ('4', 'SURESH SINGH DHAMI', 'Casual'),
      ('5', 'ISHWOR SHRESTHA', 'Casual'),
      ('6', 'SUBASAH THAMI', 'Casual'),
      ('7', 'ABISHEK CHAUDHARY', 'Casual'),
      ('8', 'EKARAMUL HAK', 'Casual'),
      ('9', 'JITAN CHAUDHARY', 'Casual'),
      ('10', 'Dilip Thapa Magar', 'Casual'),
      ('11', 'BHUPAL JIMEE', 'Casual'),
      ('12', 'SALENDRA KUMAR PATEL', 'Casual'),
      ('13', 'RAJESH KUMAR SAH SUDI', 'Casual'),
      ('14', 'RAKESH THAKUR HAJAM', 'Casual'),
      ('15', 'JOHN SSEMUDDU', 'Casual'),
      ('16', 'LAZARUS EMURON', 'Casual'),
      ('17', 'PRAKASH KHADKA', 'Casual'),
      ('18', 'KUMAR GURUNG', 'Casual'),
      ('19', 'DAN NGESO', 'Casual'),
      ('20', 'EDOUARD NDAYISABA', 'Casual'),
      ('21', 'SIRIVESTA KYAGULANYI', 'Casual'),
      ('22', 'PAUL KASULE', 'Casual'),
      ('23', 'SADAT KYEYUNE', 'Casual'),
      ('24', 'JOB MULINZI', 'Casual'),
      ('25', 'RABIN KARKI', 'Casual'),
      ('26', 'ISAAC KATO', 'Casual'),
      ('27', 'JULIUS ANDREW AYEBALE', 'Casual'),
      ('28', 'ERIC MWIZERWA', 'Casual'),
      ('29', 'ABEL TASHOBYA', 'Casual'),
      ('30', 'LAWRENCE OIRO', 'Casual'),
      ('31', 'HENRY BBOSA', 'Casual'),
      ('32', 'ENOCK MANIRUMVA', 'Casual'),
      ('33', 'UMAR KAVUMA', 'Casual'),
      ('34', 'CHRISTUS BIGIRIMANA', 'Casual'),
      ('35', 'FELIX MAHEMBE', 'Casual'),
      ('36', 'UMARU BUMBA', 'Casual'),
      ('37', 'EVARISTE MAZIMPAKA', 'Casual'),
      ('38', 'THIERRY NIYORUGIRA', 'Casual'),
      ('39', 'DAVID SEMWANGA', 'Casual'),
      ('40', 'ABU DHAKABA', 'Casual'),
      ('41', 'STEVEN MUJJUZI', 'Casual'),
      ('42', 'JOSEPH KALEMERA', 'Casual'),
      ('43', 'CLOVIS NDAGIJIMANA', 'Casual'),
      ('44', 'FISTON RUKUNDORWIMANA', 'Casual'),
      ('45', 'SAMSON NDAGIJIMANA', 'Casual'),
      ('46', 'EZECHIEL NDIKUMANA', 'Casual'),
      ('47', 'TAYIB AHMED', 'Casual'),
      ('48', 'BAMLAKU', 'Casual'),
      ('49', 'RETA LEMA', 'Casual'),
      ('50', 'OUSMAN SEID', 'Casual'),
      ('51', 'YESUF HUSEN', 'Casual'),
      ('52', 'YASIN MUHAMED', 'Casual'),
      ('53', 'SISAY TADESE', 'Casual'),
      ('54', 'KETEMA KASA', 'Casual'),
      ('55', 'EYASU YIMER', 'Casual'),
      ('56', 'SIRAJ JUNDI', 'Casual'),
      ('57', 'ABDULJEWAD', 'Casual');
  END IF;
END $$;
