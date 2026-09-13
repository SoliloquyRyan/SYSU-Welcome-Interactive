-- D-088: public programme credits only; identities, runtime and ledgers stay intact.
ALTER TABLE v2_program_catalog ADD COLUMN performers TEXT NOT NULL DEFAULT '' CHECK (length(performers) <= 240);
-- Stable ids from the approved 2026 import, never title-based runtime matching.
UPDATE v2_program_catalog SET performers = '吴津颖、宋欣然' WHERE id = 'event2026-01';
UPDATE v2_program_catalog SET performers = '陈冠翰' WHERE id = 'event2026-02';
UPDATE v2_program_catalog SET performers = '王奇琪' WHERE id = 'event2026-03';
UPDATE v2_program_catalog SET performers = '王维睿' WHERE id = 'event2026-04';
UPDATE v2_program_catalog SET performers = '杨智杰、詹金坛' WHERE id = 'event2026-05';
UPDATE v2_program_catalog SET performers = '金恩数' WHERE id = 'event2026-06';
UPDATE v2_program_catalog SET performers = '李梦莎' WHERE id = 'event2026-08';
UPDATE v2_program_catalog SET performers = '卢继翔' WHERE id = 'event2026-09';
UPDATE v2_program_catalog SET performers = '张纯熙、王薇茹' WHERE id = 'event2026-10';
UPDATE v2_program_catalog SET performers = '丁俊鑫、周倚禾' WHERE id = 'event2026-11';
UPDATE v2_program_catalog SET performers = '周倚禾、洪习戈' WHERE id = 'event2026-12';
UPDATE v2_program_catalog SET performers = '欧阳靖宇' WHERE id = 'event2026-13';
UPDATE v2_program_catalog SET performers = '麦紫馨、刘思语' WHERE id = 'event2026-15';
UPDATE v2_program_catalog SET performers = '王浩宇' WHERE id = 'event2026-16';
UPDATE v2_program_catalog SET performers = '黄惠岂' WHERE id = 'event2026-17';
UPDATE v2_program_catalog SET performers = '周芯琪' WHERE id = 'event2026-18';
UPDATE v2_program_catalog SET performers = '石驭元' WHERE id = 'event2026-19';
UPDATE v2_program_catalog SET performers = '汪静怡 + 乐队' WHERE id = 'event2026-21';
