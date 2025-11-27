import { supabaseAdmin } from "../config/supabase.js";
import { interService } from "../services/inter.service.js";
const interRoutes = async (app) => {
    app.post("/pix", async (req, reply) => {
        const body = req.body;
        try {
            const cobranca = await interService.criarCobrancaPix(supabaseAdmin, body);
            return reply.status(200).send(cobranca);
        }
        catch (err) {
            app.log.error(err, "Falha ao criar cobrança PIX no Inter");
            return reply.status(500).send({ error: err.message });
        }
    });
    app.post("/registrar-webhook", async (req, reply) => {
        const { url } = req.body;
        if (!url)
            return reply.status(400).send({ error: "URL do webhook é obrigatória" });
        try {
            const result = await interService.registrarWebhookPix(supabaseAdmin, url);
            return reply.status(200).send(result);
        }
        catch (err) {
            app.log.error(err, "Falha ao registrar webhook PIX");
            return reply.status(500).send({ error: err.message });
        }
    });
};
export default interRoutes;
