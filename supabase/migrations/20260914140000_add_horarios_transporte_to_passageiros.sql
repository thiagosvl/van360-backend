ALTER TABLE "passageiros"
  ADD COLUMN IF NOT EXISTS "horario_entrada" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "horario_saida" TEXT NULL;

ALTER TABLE "pre_passageiros"
  ADD COLUMN IF NOT EXISTS "horario_entrada" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "horario_saida" TEXT NULL;
