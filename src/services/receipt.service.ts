import { Resvg } from "@resvg/resvg-js";
import { TipoResponsavel } from "../types/enums.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import satori from "satori";
import { logger } from "../config/logger.js";
import { storageProvider } from "./providers/storage.provider.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { getMonthNameBR, getNowBR, formatToBrazilianDate } from "../utils/date.utils.js";
import { formatCurrency, capitalize, formatPaymentMethod, formatCpfCnpj, getDriverDisplayName, getReceiptProviderInfo } from "../utils/format.js";

// Utilitário para caminhos absolutos em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tipo para os dados do recibo
export interface ReceiptData {
    id: string; // ID da cobrança (DB)
    titulo: string;
    subtitulo: string; // Ex: Transporte Escolar - Tio Thiago
    motoristaNome?: string;
    motoristaRazaoSocial?: string | null;
    motoristaDocumento?: string | null;
    valor: number;
    data: string;
    pagadorNome: string;
    passageiroNome?: string;
    mes?: number;
    ano?: number;
    pagadorDocumento?: string;
    descricao?: string; // Ex: Parcela
    vencimento?: string;
    metodoPagamento: string;
    isPagamentoParcial?: boolean;
    tipo: 'PASSAGEIRO' | 'ASSINATURA';
    logoMotoristaUrl?: string | null;
}

export interface AnnualReceiptMonthItem {
    mes: number;
    mesNome: string;
    dataVencimento?: string | null;
    dataPagamento?: string | null;
    valor: number;
    pago?: boolean;
}

export interface AnnualReceiptData {
    passageiroId: string;
    ano: number;
    motoristaNome: string;
    motoristaRazaoSocial?: string | null;
    motoristaTelefone?: string | null;
    motoristaDocumento?: string | null;
    motoristaLogoUrl?: string | null;
    responsavelNome: string;
    responsavelDocumento?: string | null;
    passageiroNome: string;
    escolaNome?: string | null;
    turno?: string | null;
    meses: AnnualReceiptMonthItem[];
    totalPago: number;
    quantidadeMeses: number;
}

class ReceiptService {
    private fontData: Buffer | null = null;

    private getRootPath(): string {
        const pathSrc = path.resolve(__dirname, "..", "..");
        const pathDist = path.resolve(__dirname, "..", "..", "..");

        if (fs.existsSync(path.join(pathSrc, "assets"))) return pathSrc;
        if (fs.existsSync(path.join(pathDist, "assets"))) return pathDist;

        return process.cwd();
    }

    private async getFont() {
        if (this.fontData) return this.fontData;

        try {
            const rootPath = this.getRootPath();
            const fontPath = path.join(rootPath, "assets", "fonts", "Inter-Bold.ttf");

            logger.debug({ fontPath }, "[ReceiptService] Tentando carregar fonte");

            if (fs.existsSync(fontPath)) {
                this.fontData = fs.readFileSync(fontPath);
            } else {
                logger.error({ fontPath }, "[ReceiptService] Arquivo de fonte não encontrado");
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error({ error: msg }, "[ReceiptService] Erro ao carregar fonte");
        }
        return this.fontData;
    }

    private async getDriverLogoBase64(url?: string | null): Promise<string | null> {
        if (!url) return null;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get("content-type") || "image/png";
            return `data:${contentType};base64,${buffer.toString("base64")}`;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn({ error: msg, url }, "[ReceiptService] Falha ao carregar logo do motorista para o recibo");
            return null;
        }
    }

    private async getLogo() {
        try {
            const rootPath = this.getRootPath();
            const logoPath = path.join(rootPath, "assets", "images", "logo-van360.png");

            if (fs.existsSync(logoPath)) {
                const buffer = fs.readFileSync(logoPath);
                return `data:image/png;base64,${buffer.toString("base64")}`;
            } else {
                logger.warn({ logoPath }, "[ReceiptService] Logo não encontrado, usando fallback texto");
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error({ error: msg }, "[ReceiptService] Erro ao carregar logo");
        }
        return null;
    }

    async generateAndSave(data: ReceiptData): Promise<string | null> {
        const logId = `REC-${Date.now()}`;
        try {
            logger.info({ logId, cobrancaId: data.id, pagador: data.pagadorNome }, "[ReceiptService] Iniciando geração de recibo");

            const font = await this.getFont();
            if (!font) throw new Error("Fonte não carregada");

            const driverLogoBase64 = await this.getDriverLogoBase64(data.logoMotoristaUrl);
            const van360LogoBase64 = await this.getLogo();
            const headerLogo = driverLogoBase64 || van360LogoBase64;

            const mesNome = getMonthNameBR(data.mes);
            const referencia = data.mes ? `${mesNome}/${data.ano}` : "";

            const pagadorFormatado = capitalize(data.pagadorNome);
            const passageiroFormatado = data.passageiroNome ? capitalize(data.passageiroNome) : null;
            const baseMetodoFormatado = formatPaymentMethod(data.metodoPagamento);
            const metodoPagamentoFormatado = data.isPagamentoParcial
                ? `${baseMetodoFormatado} • Pagamento Parcial`
                : baseMetodoFormatado;

            const headerMarginBottom = headerLogo ? "24px" : "50px";
            const subtitleMarginBottom = headerLogo ? "28px" : "40px";
            const valorPadding = headerLogo ? "26px" : "30px";
            const valorMarginBottom = headerLogo ? "32px" : "40px";
            const detailsGap = headerLogo ? "18px" : "20px";

            const providerInfo = getReceiptProviderInfo({
                nome: data.motoristaNome,
                razao_social: data.motoristaRazaoSocial,
                cpfcnpj: data.motoristaDocumento
            });

            logger.debug({ logId, cobrancaId: data.id }, "[ReceiptService] Renderizando SVG via Satori");
            // @ts-ignore - Satori default export may lack call signature in Vercel build environment
            let svg = await satori(
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
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: headerMarginBottom },
                                    children: [
                                        headerLogo ?
                                            { type: "img", props: { src: headerLogo, style: { maxWidth: "240px", maxHeight: "95px", objectFit: "contain" } } } :
                                            { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold", color: "#2563eb" }, children: "VAN360" } },
                                        { type: "div", props: { style: { fontSize: "11px", color: "#94a3b8", marginTop: "10px" }, children: `ID: ${data.id.substring(0, 8)}` } }
                                    ]
                                }
                            },
                            { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold", marginBottom: "4px" }, children: "Recibo de Pagamento" } },
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", flexDirection: "column", marginBottom: subtitleMarginBottom },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "14px", fontWeight: "bold", color: "#334155", marginBottom: "2px" }, children: providerInfo.linhaCabecalho } },
                                        { type: "div", props: { style: { fontSize: "13px", color: "#64748b" }, children: "Prestação de Serviços de Transporte Escolar" } }
                                    ]
                                }
                            },

                            {
                                type: "div",
                                props: {
                                    style: { backgroundColor: "#f8fafc", padding: valorPadding, borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: valorMarginBottom },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "14px", color: "#64748b", marginBottom: "8px" }, children: "VALOR PAGO" } },
                                        { type: "div", props: { style: { fontSize: "48px", fontWeight: "bold", color: "#1e293b" }, children: formatCurrency(data.valor) } },
                                        { type: "div", props: { style: { fontSize: "12px", color: "#94a3b8", marginTop: "8px" }, children: metodoPagamentoFormatado } }
                                    ]
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", flexDirection: "column", gap: detailsGap },
                                    children: [
                                        this.renderRow("Pagador", pagadorFormatado),
                                        passageiroFormatado ? this.renderRow("Aluno", passageiroFormatado) : null,
                                        data.pagadorDocumento ? this.renderRow("CPF/CNPJ", formatCpfCnpj(data.pagadorDocumento)) : null,
                                        this.renderRow("Data do Pagamento", data.data),
                                        data.mes ? this.renderRow("Mês de Referência", `${data.descricao || 'Parcela'} de ${referencia}`) :
                                            (data.descricao ? this.renderRow("Referente a", data.descricao) : null),
                                    ].filter(Boolean)
                                }
                            },

                            {
                                type: "div",
                                props: {
                                    style: { marginTop: "auto", paddingTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "12px", color: "#94a3b8" }, children: "Recibo digital gerado pela plataforma Van360." } },
                                        van360LogoBase64 && driverLogoBase64 ?
                                            { type: "img", props: { src: van360LogoBase64, style: { width: "70px", height: "24px", opacity: 0.6, objectFit: "contain" } } } :
                                            null
                                    ].filter(Boolean)
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

            svg = svg.replace(
                /(<image[^>]+width="240"[^>]+)preserveAspectRatio="xMidYMid"/,
                '$1preserveAspectRatio="xMinYMid meet"'
            );

            logger.debug({ logId, cobrancaId: data.id }, "[ReceiptService] Convertendo SVG para PNG");
            const resvg = new Resvg(svg, {
                fitTo: {
                    mode: "zoom",
                    value: 2,
                },
            });
            const pngData = resvg.render();
            const pngBuffer = pngData.asPng();

            const fileName = `${data.id}_${Date.now()}.png`;
            logger.info({ logId, cobrancaId: data.id, fileName }, "[ReceiptService] Fazendo upload para Storage");

            const { error: uploadError } = await storageProvider.upload("recibos", fileName, pngBuffer, {
                contentType: "image/png",
                upsert: true
            });

            if (uploadError) throw uploadError;

            const publicUrl = storageProvider.getPublicUrl("recibos", fileName);

            logger.info({ logId, cobrancaId: data.id, publicUrl }, "[ReceiptService] Recibo gerado com sucesso");
            return publicUrl;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ logId, cobrancaId: data.id, error: msg }, "[ReceiptService] Falha ao gerar recibo");
            return null;
        }
    }

    async deleteReceipt(url: string | null): Promise<void> {
        if (!url) return;
        try {
            const parts = url.split("/");
            const fileName = parts[parts.length - 1];
            if (!fileName) return;

            await storageProvider.remove("recibos", [fileName]);
            logger.info({ fileName }, "[ReceiptService] Recibo deletado do Storage");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error({ error: msg, url }, "[ReceiptService] Falha ao deletar do Storage");
        }
    }

    async generateForCobranca(cobrancaId: string): Promise<string | null> {
        const logId = `GEN-${Date.now()}`;
        try {
            const { data: cobranca, error } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);

            if (error || !cobranca) {
                logger.error({ error, cobrancaId }, "[ReceiptService] Cobrança não encontrada");
                return null;
            }

            const motoristaInfo = (cobranca as Record<string, any>).motorista;
            const passageiroInfo = cobranca.passageiro as Record<string, any> | undefined;
            const respLink = Array.isArray(passageiroInfo?.responsaveis) ? (passageiroInfo.responsaveis.find((r: any) => r.tipo === TipoResponsavel.PRINCIPAL) || passageiroInfo.responsaveis[0]) : null;
            const rawRespObj = passageiroInfo?.responsavel_principal || (respLink ? (Array.isArray(respLink.responsavel) ? respLink.responsavel[0] : respLink.responsavel) : null);
            const respObj = Array.isArray(rawRespObj) ? rawRespObj[0] : rawRespObj;
            const respNome = respObj?.nome || "";
            const respCpf = respObj?.cpf || "";

            const isParcial = cobranca.valor_pago !== null && cobranca.valor_pago !== undefined && Number(cobranca.valor_pago) < Number(cobranca.valor);

            const receiptData: ReceiptData = {
                id: cobranca.id,
                titulo: "Recibo de Pagamento",
                subtitulo: getDriverDisplayName(motoristaInfo) || "Transporte Escolar",
                motoristaNome: motoristaInfo?.nome,
                motoristaRazaoSocial: motoristaInfo?.razao_social,
                motoristaDocumento: motoristaInfo?.cpfcnpj,
                valor: Number(cobranca.valor_pago || cobranca.valor),
                data: cobranca.data_pagamento ? formatToBrazilianDate(cobranca.data_pagamento) : formatToBrazilianDate(getNowBR()),
                pagadorNome: respNome,
                passageiroNome: passageiroInfo?.nome,
                mes: cobranca.mes,
                ano: cobranca.ano,
                pagadorDocumento: respCpf,
                descricao: cobranca.mes ? "Parcela" : "Cobrança Avulsa",
                metodoPagamento: cobranca.tipo_pagamento,
                isPagamentoParcial: isParcial,
                tipo: 'PASSAGEIRO',
                logoMotoristaUrl: motoristaInfo?.logo_url || null,
            };

            const url = await this.generateAndSave(receiptData);

            if (url) {
                const { error: updateError } = await cobrancaRepository.update(cobrancaId, { recibo_url: url });

                if (updateError) {
                    logger.error({ logId, cobrancaId, error: updateError.message }, "[ReceiptService] Erro ao salvar recibo_url na cobranca");
                } else {
                    logger.info({ logId, cobrancaId, url }, "[ReceiptService] URL do recibo persistida no banco");
                }
            }

            return url;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error({ error: msg, cobrancaId }, "[ReceiptService] Erro generateForCobranca");
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

    async generateAnnualReceipt(data: AnnualReceiptData): Promise<string | null> {
        const logId = `REC-ANUAL-${Date.now()}`;
        try {
            logger.info({ logId, passageiroId: data.passageiroId, ano: data.ano }, "[ReceiptService] Iniciando geração de recibo anual");

            const font = await this.getFont();
            if (!font) throw new Error("Fonte não carregada");

            const driverLogoBase64 = await this.getDriverLogoBase64(data.motoristaLogoUrl);
            const van360LogoBase64 = await this.getLogo();
            const headerLogo = driverLogoBase64 || van360LogoBase64;

            const emissaoFormatada = formatToBrazilianDate(getNowBR());
            const canvasHeight = Math.max(720, 600 + (data.meses.length * 36));

            const providerInfo = getReceiptProviderInfo({
                nome: data.motoristaNome,
                razao_social: data.motoristaRazaoSocial,
                cpfcnpj: data.motoristaDocumento
            });

            const rowsMeses = data.meses.map((item) => {
                const mesSigla = item.mesNome
                    ? item.mesNome.slice(0, 3).toUpperCase()
                    : `MÊS ${item.mes}`;

                return {
                    type: "div",
                    props: {
                        style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "9px 16px",
                            borderBottom: "1px solid #f1f5f9",
                            fontSize: "13px",
                        },
                        children: [
                            { type: "div", props: { style: { width: "100px", fontWeight: "bold", color: "#334155" }, children: mesSigla } },
                            { type: "div", props: { style: { flex: 1, color: "#16a34a", fontWeight: "bold" }, children: "PAGO" } },
                            { type: "div", props: { style: { width: "140px", textAlign: "right", fontWeight: "bold", color: "#0f172a" }, children: formatCurrency(item.valor) } },
                        ]
                    }
                };
            });

            // @ts-ignore - Satori default export may lack call signature in Vercel build environment
            let svg = await satori(
                {
                    type: "div",
                    props: {
                        style: {
                            display: "flex",
                            flexDirection: "column",
                            width: "600px",
                            height: `${canvasHeight}px`,
                            backgroundColor: "#ffffff",
                            padding: "40px",
                            fontFamily: "Inter",
                        },
                        children: [
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" },
                                    children: [
                                        headerLogo ?
                                            { type: "img", props: { src: headerLogo, style: { maxWidth: "240px", maxHeight: "85px", objectFit: "contain" } } } :
                                            { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold", color: "#2563eb" }, children: "VAN360" } },
                                        {
                                            type: "div",
                                            props: {
                                                style: {
                                                    backgroundColor: "#f1f5f9",
                                                    color: "#475569",
                                                    fontSize: "11px",
                                                    fontWeight: "bold",
                                                    padding: "5px 12px",
                                                    borderRadius: "999px",
                                                },
                                                children: `REFERÊNCIA ${data.ano}`
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", flexDirection: "column", marginBottom: "24px" },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "26px", fontWeight: "bold", color: "#0f172a", marginBottom: "4px" }, children: "Recibo Anual de Pagamento" } },
                                        { type: "div", props: { style: { fontSize: "14px", fontWeight: "bold", color: "#334155", marginBottom: "2px" }, children: providerInfo.linhaCabecalho } },
                                        { type: "div", props: { style: { fontSize: "13px", color: "#64748b" }, children: "Prestação de Serviços de Transporte Escolar" } }
                                    ]
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: {
                                        backgroundColor: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        padding: "16px 22px",
                                        borderRadius: "14px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: "24px"
                                    },
                                    children: [
                                        {
                                            type: "div",
                                            props: {
                                                style: {
                                                    fontSize: "13px",
                                                    fontWeight: "bold",
                                                    color: "#64748b",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.5px"
                                                },
                                                children: "TOTAL PAGO"
                                            }
                                        },
                                        {
                                            type: "div",
                                            props: {
                                                style: { fontSize: "26px", fontWeight: "bold", color: "#0f172a" },
                                                children: formatCurrency(data.totalPago)
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: { display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" },
                                    children: [
                                        this.renderRow("Pagador", capitalize(data.responsavelNome)),
                                        data.responsavelDocumento ? this.renderRow("CPF do Pagador", formatCpfCnpj(data.responsavelDocumento)) : null,
                                        this.renderRow("Aluno", capitalize(data.passageiroNome)),
                                    ].filter(Boolean)
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: {
                                        display: "flex",
                                        flexDirection: "column",
                                    },
                                    children: [
                                        {
                                            type: "div",
                                            props: {
                                                style: {
                                                    fontSize: "12px",
                                                    fontWeight: "bold",
                                                    color: "#475569",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.5px",
                                                    marginBottom: "8px"
                                                },
                                                children: `DETALHES DO PAGAMENTO ${data.ano}`
                                            }
                                        },
                                        {
                                            type: "div",
                                            props: {
                                                style: {
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    border: "1px solid #e2e8f0",
                                                    borderRadius: "12px",
                                                    overflow: "hidden"
                                                },
                                                children: [
                                                    {
                                                        type: "div",
                                                        props: {
                                                            style: {
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                backgroundColor: "#f8fafc",
                                                                padding: "8px 16px",
                                                                fontSize: "12px",
                                                                fontWeight: "bold",
                                                                color: "#475569",
                                                                borderBottom: "1px solid #e2e8f0"
                                                            },
                                                            children: [
                                                                { type: "div", props: { style: { width: "100px" }, children: "Data" } },
                                                                { type: "div", props: { style: { flex: 1 }, children: "Status" } },
                                                                { type: "div", props: { style: { width: "140px", textAlign: "right" }, children: "Valor" } },
                                                            ]
                                                        }
                                                    },
                                                    ...rowsMeses
                                                ]
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                type: "div",
                                props: {
                                    style: {
                                        marginTop: "auto",
                                        paddingTop: "16px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    },
                                    children: [
                                        { type: "div", props: { style: { fontSize: "11px", color: "#94a3b8" }, children: `Recibo digital gerado pela plataforma Van360 • Emitido em ${emissaoFormatada}` } },
                                        van360LogoBase64 && driverLogoBase64 ?
                                            { type: "img", props: { src: van360LogoBase64, style: { width: "70px", height: "24px", opacity: 0.6, objectFit: "contain" } } } :
                                            null
                                    ].filter(Boolean)
                                }
                            }
                        ]
                    }
                },
                {
                    width: 600,
                    height: canvasHeight,
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

            svg = svg.replace(
                /(<image[^>]+)preserveAspectRatio="xMidYMid"/,
                '$1preserveAspectRatio="xMinYMid meet"'
            );

            logger.debug({ logId, passageiroId: data.passageiroId }, "[ReceiptService] Convertendo SVG do recibo anual para PNG");
            const resvg = new Resvg(svg, {
                fitTo: {
                    mode: "zoom",
                    value: 2,
                },
            });
            const pngData = resvg.render();
            const pngBuffer = pngData.asPng();

            const fileName = `anual_${data.passageiroId}_${data.ano}_${Date.now()}.png`;
            logger.info({ logId, passageiroId: data.passageiroId, fileName }, "[ReceiptService] Fazendo upload do recibo anual para Storage");

            const { error: uploadError } = await storageProvider.upload("recibos", fileName, pngBuffer, {
                contentType: "image/png",
                upsert: true
            });

            if (uploadError) throw uploadError;

            const publicUrl = storageProvider.getPublicUrl("recibos", fileName);
            logger.info({ logId, passageiroId: data.passageiroId, publicUrl }, "[ReceiptService] Recibo anual gerado com sucesso");
            return publicUrl;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ logId, passageiroId: data.passageiroId, error: msg }, "[ReceiptService] Falha ao gerar recibo anual");
            return null;
        }
    }
}

export const receiptService = new ReceiptService();
