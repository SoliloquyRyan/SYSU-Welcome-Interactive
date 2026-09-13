-- D-096: additive ceremony metadata. Legacy kind constraints and history remain intact.
ALTER TABLE v2_program_catalog ADD COLUMN ceremony_type TEXT NOT NULL DEFAULT '' CHECK(ceremony_type IN ('','AWARD','SPEECH'));
ALTER TABLE v2_program_catalog ADD COLUMN gifts_enabled INTEGER NOT NULL DEFAULT 1 CHECK(gifts_enabled IN (0,1));
ALTER TABLE v2_program_catalog ADD COLUMN award_group TEXT NOT NULL DEFAULT '' CHECK(award_group IN ('','PROGRAM','CAMPUS'));
-- This specific performance does not accept gifts, including in an existing directory.
UPDATE v2_program_catalog SET gifts_enabled=0 WHERE title IN ('光年之外','《光年之外》');
CREATE TABLE v2_awards (
 id TEXT PRIMARY KEY, group_code TEXT NOT NULL CHECK(group_code IN ('PROGRAM','CAMPUS')),
 title TEXT NOT NULL, description TEXT NOT NULL, sort_order INTEGER NOT NULL UNIQUE,
 entries_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(entries_json)),
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('program-honors','PROGRAM','节目颁奖','获奖节目由主控确认',1);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('route-3','CAMPUS','路线打卡 · 一等奖','完成三条路线',2);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('route-2','CAMPUS','路线打卡 · 二等奖','完成两条路线',3);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('route-1','CAMPUS','路线打卡 · 三等奖','完成一条路线',4);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('photography','CAMPUS','最佳摄影奖','观众投票评选',5);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('creativity','CAMPUS','最佳创意奖','观众投票评选',6);
INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('points-top20','CAMPUS','打卡积分前 20 名','按最终打卡积分排名',7);
CREATE TABLE v2_ceremony_state (
 id INTEGER PRIMARY KEY CHECK(id=1), reset_epoch INTEGER NOT NULL CHECK(reset_epoch>=1),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 mode TEXT NOT NULL DEFAULT 'PROGRAM' CHECK(mode IN ('PROGRAM','HOST','AWARD')),
 award_id TEXT REFERENCES v2_awards(id), page INTEGER NOT NULL DEFAULT 0 CHECK(page>=0),
 revealed INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0,1))
);
INSERT INTO v2_ceremony_state(id,reset_epoch) SELECT 1,reset_epoch FROM v2_runtime_state;

