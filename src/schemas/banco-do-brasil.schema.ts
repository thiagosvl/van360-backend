import { z } from "zod";

export const bancoDoBrasilConfigSchema = z.object({
  convenio: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  carteira: z.union([z.string(), z.number()]).transform((v) => Number(v)).default(17),
  variacaoCarteira: z.union([z.string(), z.number()]).transform((v) => Number(v)).default(19),
  clientId: z.string().trim().optional(),
  clientSecret: z.string().trim().optional(),
  developerKey: z.string().trim().optional(),
});

export type BancoDoBrasilConfig = z.infer<typeof bancoDoBrasilConfigSchema>;

export const bancoDoBrasilWebhookBaixaSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  numeroConvenio: z.union([z.string(), z.number()]).optional().transform((v) => (v !== undefined ? String(v) : undefined)),
  dataRegistro: z.string().optional(),
  dataVencimento: z.string().optional(),
  valorOriginal: z.number().optional(),
  valorPagoSacado: z.number().nonnegative(),
  numeroOperacao: z.union([z.string(), z.number()]).optional(),
  carteiraConvenio: z.number().optional(),
  variacaoCarteiraConvenio: z.number().optional(),
  codigoEstadoBaixaOperacional: z.number().optional(),
  dataLiquidacao: z.string().optional(),
  dataHoraLiquidacao: z.string().optional(),
  instituicaoLiquidacao: z.union([z.string(), z.number()]).optional().transform((v) => (v !== undefined ? String(v) : undefined)),
  canalLiquidacao: z.number().int().optional(),
  codigoModalidadeBoleto: z.number().optional(),
  formaPagamento: z.number().int().optional(),
  identidadePortador: z.union([z.string(), z.number()]).optional().transform((v) => (v !== undefined ? String(v) : undefined)),
  nomePortador: z.string().optional(),
  tipoPessoaPortador: z.number().int().optional(),
  dataCredito: z.string().optional(),
  codigoCanalPagamento: z.number().optional(),
  codigoTipoLiquidacao: z.number().optional(),
  naturezaRecebimento: z.number().optional()
}).passthrough();

export type BancoDoBrasilWebhookBaixa = z.infer<typeof bancoDoBrasilWebhookBaixaSchema>;
