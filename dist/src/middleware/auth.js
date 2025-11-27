import { supabaseAdmin } from "../config/supabase.js";
export async function verifySupabaseJWT(request, reply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return reply.status(401).send({ error: "Token ausente ou inválido" });
        }
        const token = authHeader.split(" ")[1];
        const { data: user, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user.user) {
            return reply.status(401).send({ error: "Token inválido" });
        }
        request.user = user.user;
    }
    catch (err) {
        return reply.status(401).send({ error: err.message });
    }
}
