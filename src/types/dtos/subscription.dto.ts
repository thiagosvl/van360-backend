import { z } from "zod";
import { CheckoutPaymentMethod } from "../enums.js";

export const createInvoiceSchema = z.object({
    planId: z.string().uuid(),
    paymentMethod: z.nativeEnum(CheckoutPaymentMethod).default(CheckoutPaymentMethod.PIX),
    paymentToken: z.string().optional(),
    savedCardId: z.string().uuid().optional(),
    saveCard: z.boolean().optional().default(true),
    cardBrand: z.string().optional(),
    cardLast4: z.string().optional(),
    expireMonth: z.string().optional(),
    expireYear: z.string().optional(),
    birth: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    neighborhood: z.string().optional(),
    zipcode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;
