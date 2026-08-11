ALTER TABLE participant_states
  ADD COLUMN star_temperature_kelvin INTEGER
  CHECK (
    star_temperature_kelvin IS NULL
    OR star_temperature_kelvin BETWEEN 2400 AND 12000
  );

ALTER TABLE participant_states
  ADD COLUMN star_temperature_locked_at TEXT;

CREATE INDEX participant_states_temperature_idx
  ON participant_states(star_temperature_kelvin)
  WHERE star_temperature_kelvin IS NOT NULL;
