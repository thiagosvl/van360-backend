import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import satori from "satori";
import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { getMonthNameBR } from "../utils/date.utils.js";
import { formatCurrency } from "../utils/format.js";

// Tipo para os dados do recibo
export interface ReceiptData {
    id: string; // ID da cobrança (DB)
    titulo: string;
    subtitulo: string; // Ex: Transporte Escolar - Tio Thiago
    valor: number;
    data: string;
    pagadorNome: string;
    passageiroNome?: string;
    mes?: number;
    ano?: number;
    pagadorDocumento?: string;
    descricao?: string; // Ex: Mensalidade
    vencimento?: string;
    metodoPagamento: string;
    tipo: 'PASSAGEIRO' | 'ASSINATURA';
}

class ReceiptService {
    private fontData: Buffer | null = null;

    private async getFont() {
        if (this.fontData) return this.fontData;
        
        try {
            const fontPath = path.resolve(process.cwd(), "assets", "fonts", "Inter-Bold.ttf");
            const exists = fs.existsSync(fontPath);
            logger.info({ fontPath, exists }, "Tentando carregar fonte");

            if (exists) {
                this.fontData = fs.readFileSync(fontPath);
                logger.info({ size: this.fontData?.length }, "Fonte carregada com sucesso");
            } else {
                logger.error({ fontPath }, "Fonte Inter-Bold.ttf não encontrada");
            }
        } catch (e: any) {
            logger.error({ error: e.message, stack: e.stack }, "Erro ao carregar fonte para recibos");
        }
        return this.fontData;
    }

    private async getLogo() {
        try {
            const logoPath = path.resolve(process.cwd(), "assets", "images", "logo-van360.png");
            if (fs.existsSync(logoPath)) {
                const buffer = fs.readFileSync(logoPath);
                return `data:image/png;base64,${buffer.toString("base64")}`;
            }
        } catch (e: any) {
            logger.error({ error: e.message }, "Erro ao carregar logo para recibos");
        }
        return null;
    }

    // Métodos de formatação agora são centralizados em date.utils.js

    /**
     * Gera a imagem do recibo e salva no Storage
     */
    async generateAndSave(data: ReceiptData): Promise<string | null> {
        const logId = `REC-${Date.now()}`;
        try {
            logger.info({ logId, dataId: data.id, tipo: data.tipo, pagador: data.pagadorNome }, "Iniciando geração de recibo (DEBUG)");

            const font = await this.getFont();
            if (!font) {
                logger.error({ logId, dataId: data.id }, "Fonte não carregada. Impossível gerar recibo.");
                throw new Error("Fonte não carregada. Impossível gerar recibo.");
            }
            logger.info({ logId }, "Fonte carregada OK");

            const logoBase64 = await this.getLogo();
            logger.info({ logId, hasLogo: !!logoBase64 }, "Logo carregado");
            
            const mesNome = getMonthNameBR(data.mes);
            const referencia = data.mes ? `${mesNome}/${data.ano}` : "";

            // 1. Definir o Layout (JSX-like)
            logger.info({ logId }, "Iniciando Satori...");
            const svg = await satori(
                {
                    type: "div",
                    props: {
                        style: {
                            display: "flex",
                            flexDirection: "column",
                            width: "600px",
                            height: "800px",
                            backgroundColor: "#ffffff",
                            padding: "40px",
                            fontFamily: "Inter",
                        },
                        children: [
                            // Header
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "50px" },
                                    children: [
                                        logoBase64 ? 
                                        { type: "img", props: { src: logoBase64, style: { width: "120px", height: "60px" } } } :
                                        { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold", color: "#2563eb" }, children: "VAN360" } },
                                        { type: "div", props: { style: { fontSize: "11px", color: "#94a3b8", marginTop: "10px" }, children: `ID: ${data.id.substring(0, 8)}` } }
                                    ]
                                }
                            },
                            // Título
                            { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold", marginBottom: "4px" }, children: "Comprovante de Pagamento" } },
                            { type: "div", props: { style: { fontSize: "14px", color: "#64748b", marginBottom: "40px" }, children: data.subtitulo } },
                            
                            // Valor Grande
                            {
                                type: "div",
                                props: {
                                    style: { backgroundColor: "#f8fafc", padding: "30px", borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "40px" },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "14px", color: "#64748b", marginBottom: "8px" }, children: "VALOR PAGO" } },
                                        { type: "div", props: { style: { fontSize: "48px", fontWeight: "bold", color: "#1e293b" }, children: formatCurrency(data.valor) } },
                                        { type: "div", props: { style: { fontSize: "12px", color: "#94a3b8", marginTop: "8px" }, children: data.metodoPagamento } }
                                    ]
                                }
                            },
                            // Detalhes
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", flexDirection: "column", gap: "20px" },
                                    children: [
                                        this.renderRow("Pagador", data.pagadorNome),
                                        data.passageiroNome ? this.renderRow("Passageiro", data.passageiroNome) : null,
                                        data.pagadorDocumento ? this.renderRow("CPF/CNPJ", data.pagadorDocumento) : null,
                                        this.renderRow("Data do Pagamento", data.data),
                                        data.mes ? this.renderRow("Referente a", `${data.descricao || 'Mensalidade'} - ${referencia}`) : 
                                                 (data.descricao ? this.renderRow("Referente a", data.descricao) : null),
                                    ].filter(Boolean)
                                }
                            },

                            // Footer
                            {
                                type: "div",
                                props: {
                                    style: { marginTop: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "20px", display: "flex", justifyContent: "center" },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "12px", color: "#94a3b8" }, children: "Este é um comprovante digital gerado automaticamente pelo Van360." } }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    width: 600,
                    height: 800,
                    fonts: [
                        {
                            name: "Inter",
                            data: font,
                            weight: 700,
                            style: "normal",
                        },
                    ],
                }
            );
            logger.info({ logId }, "SVG Gerado OK");

            // 2. Converter para PNG
            const resvg = new Resvg(svg);
            const pngData = resvg.render();
            const pngBuffer = pngData.asPng();
            logger.info({ logId, size: pngBuffer.length }, "PNG Renderizado OK");

            // 3. Salvar no Supabase Storage
            const fileName = `${data.tipo.toLowerCase()}_${data.id}_${Date.now()}.png`;
            logger.info({ logId, fileName }, "Enviando pro Supabase...");
            
            const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
                .from("recibos")
                .upload(fileName, pngBuffer, {
                    contentType: "image/png",
                    upsert: true
                });

            if (uploadError) {
                logger.error({ logId, uploadError }, "Erro no Upload Supabase");
                throw uploadError;
            }

            // 4. Obter URL Pública
            const { data: { publicUrl } } = supabaseAdmin.storage
                .from("recibos")
                .getPublicUrl(fileName);

            logger.info({ logId, publicUrl }, "Recibo gerado e salvo com sucesso!");
            return publicUrl;
        } catch (error: any) {
            logger.error({ 
                logId,
                error: error.message || error, 
                stack: error.stack,
                dataId: data.id,
                dataType: data.tipo
            }, "Erro CRÍTICO ao gerar/salvar recibo");
            return null;
        }
    }

    /**
     * Remove o arquivo de recibo do Storage do Supabase baseado na URL pública
     */
    async deleteReceipt(url: string | null): Promise<void> {
        if (!url) return;
        
        try {
            // Extrair o nome do arquivo da URL pública
            // URL format: https://.../storage/v1/object/public/recibos/filename.png
            const parts = url.split("/");
            const fileName = parts[parts.length - 1];
            
            if (!fileName) return;

            const { error } = await supabaseAdmin.storage
                .from("recibos")
                .remove([fileName]);

            if (error) {
                logger.error({ error, url, fileName }, "Erro ao deletar recibo do Storage");
            } else {
                logger.info({ fileName }, "Recibo deletado do Storage com sucesso");
            }
        } catch (e: any) {
            logger.error({ error: e.message, url }, "Erro inesperado ao deletar recibo do Storage");
        }
    }

    /**
     * Busca dados da cobrança e gera o recibo síncrono
     * Centraliza a lógica para ser usada em qualquer fluxo (manual, criação, etc)
     */
    async generateForCobranca(cobrancaId: string): Promise<string | null> {
        try {
            logger.info({ cobrancaId }, "[ReceiptService.generateForCobranca] Buscando dados para recibo");
            
            // 1. Busca a cobrança com passageiro e o motorista (tabela usuarios)
            const { data: cobranca, error } = await supabaseAdmin
                .from("cobrancas")
                .select(`
                    *,
                    passageiro:passageiros (
                        nome,
                        nome_responsavel,
                        cpf_responsavel
                    ),
                    motorista:usuarios (
                        nome
                    )
                `)
                .eq("id", cobrancaId)
                .single();

            if (error || !cobranca) {
                logger.error({ error, cobrancaId }, "Erro ao buscar dados da cobrança para gerar recibo");
                return null;
            }

            const motoristaNome = (cobranca as any).motorista?.nome || "Transporte Escolar";

            const receiptData: ReceiptData = {
                id: cobranca.id,
                titulo: "Comprovante de Pagamento",
                subtitulo: cobranca.motorista?.nome_exibicao || "Transporte Escolar",
                valor: cobranca.valor_pago || cobranca.valor,
                data: cobranca.data_pagamento ? new Date(cobranca.data_pagamento).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
                pagadorNome: cobranca.passageiro?.nome_responsavel || cobranca.passageiro?.nome,
                passageiroNome: cobranca.passageiro?.nome,
                mes: cobranca.mes,
                ano: cobranca.ano,
                pagadorDocumento: cobranca.passageiro?.cpf_responsavel,
                descricao: "Mensalidade",
                metodoPagamento: cobranca.tipo_pagamento || "DINHEIRO",
                tipo: 'PASSAGEIRO'
            };

            const url = await this.generateAndSave(receiptData);

            if (url) {
                // Atualiza a cobrança com a URL do recibo
                await supabaseAdmin
                    .from("cobrancas")
                    .update({ recibo_url: url })
                    .eq("id", cobrancaId);
                
                logger.info({ cobrancaId, url }, "Recibo gerado e vinculado à cobrança");
            }

            return url;
        } catch (e: any) {
            logger.error({ error: e.message, cobrancaId }, "Erro ao gerar recibo para cobrança");
            return null;
        }
    }

    private renderRow(label: string, value: string) {
        return {
            type: "div",
            props: {
                style: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" },
                children: [
                    { type: "div", props: { style: { fontSize: "14px", color: "#64748b" }, children: label } },
                    { type: "div", props: { style: { fontSize: "14px", fontWeight: "bold", color: "#1e293b" }, children: value } }
                ]
            }
        };
    }
}

export const receiptService = new ReceiptService();
