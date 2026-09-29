ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS cpf_responsavel VARCHAR(14) NULL;

ALTER TABLE metodos_pagamento 
ADD COLUMN IF NOT EXISTS holder_name VARCHAR(255) NULL;

ALTER TABLE metodos_pagamento 
ADD COLUMN IF NOT EXISTS holder_document VARCHAR(18) NULL;
