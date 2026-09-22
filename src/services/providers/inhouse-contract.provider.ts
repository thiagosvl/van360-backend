import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument, PDFImage, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { formatToBrazilianDate, getNowBR, parseLocalDate } from '../../utils/date.utils.js';
import { formatModalidade, formatParentesco, formatPeriodo, maskCnpj, maskCpf, maskPhone } from '../../utils/format.js';

function isValidPng(buf: Buffer | Uint8Array): boolean {
  if (!buf || buf.length < 8) return false;
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== pngSig[i]) return false;
  }
  let offset = 8;
  let hasIend = false;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const len = ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
    const type = String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
    offset += 8;

    if (offset + len + 4 > buf.length) {
      return false;
    }

    if (type === 'IDAT') {
      idatChunks.push(Buffer.from(buf.buffer, buf.byteOffset + offset, len));
    } else if (type === 'IEND') {
      hasIend = true;
      break;
    }

    offset += len + 4;
  }

  if (!hasIend || idatChunks.length === 0) return false;

  try {
    const totalIdat = Buffer.concat(idatChunks);
    zlib.inflateSync(totalIdat);
    return true;
  } catch {
    return false;
  }
}

function isJpeg(buf: Buffer | Uint8Array): boolean {
  return !!buf && buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function resolveImageBuffer(imageSource?: string | null): Promise<Buffer | null> {
  if (!imageSource) return null;

  if (imageSource.startsWith('data:')) {
    const commaIdx = imageSource.indexOf(',');
    if (commaIdx !== -1) {
      return Buffer.from(imageSource.slice(commaIdx + 1), 'base64');
    }
    return null;
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(imageSource, { signal: controller.signal });
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function embedImageSafely(pdfDoc: PDFDocument, imageBuffer: Buffer): Promise<PDFImage | null> {
  if (isValidPng(imageBuffer)) {
    return await pdfDoc.embedPng(imageBuffer);
  }
  if (isJpeg(imageBuffer)) {
    return await pdfDoc.embedJpg(imageBuffer);
  }
  return null;
}

import { storageProvider } from './storage.provider.js';
import { contractRepository } from '../../repositories/contract.repository.js';
import {
  ContractGenerationParams,
  ContractGenerationResponse,
  ContractProvider,
  ContractSignatureParams,
  ContractSignatureResponse,
  DadosContrato,
} from '../../types/contract.js';
import { ContractMultaTipo, ContratoProvider } from '../../types/enums.js';

export class InHouseContractProvider implements ContractProvider {
  name = ContratoProvider.INHOUSE;

  async gerarContrato(params: ContractGenerationParams): Promise<ContractGenerationResponse> {
    const pdfDoc = await this.criarPdfBase(params.dadosContrato);
    const pdfBytes = await pdfDoc.save();
    const fileName = `minutas/${params.contratoId}.pdf`;

    const { error } = await storageProvider.upload('contratos', fileName, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (error) throw error;

    const publicUrl = storageProvider.getPublicUrl('contratos', fileName);

    return {
      documentUrl: publicUrl,
    };
  }

  async processarAssinatura(params: ContractSignatureParams): Promise<ContractSignatureResponse> {
    const { data: contrato, error } = await contractRepository.getMinutaAndData(params.contratoId);

    if (error || !contrato) throw new Error('Contrato não encontrado');

    const minutaPath = contrato.minuta_url.split('/contratos/')[1];
    const { data: pdfBuffer, error: downloadError } = await storageProvider.download('contratos', minutaPath);

    if (downloadError) throw downloadError;

    const pdfBytes = await pdfBuffer.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Tentar extrair a posição Y da linha de assinatura dos metadados
    let signatureY = 190; // Fallback
    try {
      const keywords = pdfDoc.getKeywords();
      // keywords pode ser string "SIG_Y:123" ou undefined dependendo da versão/criação
      if (keywords) {
        const match = keywords.match(/SIG_Y:(\d+(\.\d+)?)/);
        if (match && match[1]) {
          signatureY = parseFloat(match[1]);
          console.log(`[processarAssinatura] Usando Y dinâmico para assinatura: ${signatureY}`);
        }
      }
    } catch (e) {
      console.warn('Erro ao ler metadata PDF', e);
    }

    if (params.assinaturaBase64) {
      try {
        const imageBuffer = await resolveImageBuffer(params.assinaturaBase64);
        if (imageBuffer) {
          const signatureImage = await embedImageSafely(pdfDoc, imageBuffer);
          if (signatureImage) {
            const pages = pdfDoc.getPages();
            const ultimaPagina = pages[pages.length - 1];
            const imageY = signatureY + 2;

            ultimaPagina.drawImage(signatureImage, {
              x: 350,
              y: imageY,
              width: 150,
              height: 50,
            });
          }
        }
      } catch (e) {
        console.error('Error embedding parent signature', e);
      }
    }

    await this.adicionarRodapeAuditoria(pdfDoc, {
      ...params,
      nomeAssinante: params.nomeAssinante || contrato.dados_contrato.nomeResponsavel
    });

    const finalPdfBytes = await pdfDoc.save();
    const finalFileName = `assinados/${params.contratoId}.pdf`;

    const { error: uploadError } = await storageProvider.upload('contratos', finalFileName, Buffer.from(finalPdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (uploadError) throw uploadError;

    const publicUrl = storageProvider.getPublicUrl('contratos', finalFileName);

    return {
      documentoFinalUrl: publicUrl,
      assinadoEm: getNowBR().toISOString(),
    };
  }

  async consultarStatus(contratoId: string): Promise<any> {
    const { data, error } = await contractRepository.getBasicStatus(contratoId);
    if (error) throw error;
    return data;
  }

  async baixarDocumento(contratoId: string): Promise<Buffer> {
    const { data: contrato } = await contractRepository.getFinalUrl(contratoId);
    if (!contrato?.contrato_final_url) throw new Error('Documento não encontrado');
    const pathDownload = contrato.contrato_final_url.split('/contratos/')[1];
    const { data: pdfBuffer } = await storageProvider.download('contratos', pathDownload);
    if (!pdfBuffer) throw new Error('Erro ao baixar documento');
    return Buffer.from(await pdfBuffer.arrayBuffer());
  }

  private splitTextToLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    if (!text || typeof text !== 'string') return [];
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const paragraph of paragraphs) {
      const words = paragraph.split(' ');
      let currentLine = '';
      for (const word of words) {
        if (!word) continue;
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, size);
        if (textWidth > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            lines.push(word);
            currentLine = '';
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }
    return lines.length > 0 ? lines : [''];
  }



  async criarPdfBase(dados: DadosContrato): Promise<PDFDocument> {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // SETUP DE ESTILOS E FONTES (Aumentados conforme pedido)
    const fontSizeBody = 11; // Era 9
    const fontSizeHeader = 12; // Era 11
    const fontSizeTitle = 16; // Era 14
    const lineHeight = 16; // Era 12
    const headerSpacing = 20; // Era 15

    let currentY = 800;
    const margin = 50;
    const width = 495;

    if (dados.logoCondutorUrl) {
      try {
        const imageBuffer = await resolveImageBuffer(dados.logoCondutorUrl);
        if (imageBuffer) {
          const logoImage = await embedImageSafely(pdfDoc, imageBuffer);
          if (logoImage) {
            const { width: imgW, height: imgH } = logoImage;
            const maxWidth = 110;
            const maxHeight = 65;
            const scale = Math.min(maxWidth / imgW, maxHeight / imgH, 1);
            const finalWidth = imgW * scale;
            const finalHeight = imgH * scale;

            const headerTopY = 795;
            const headerHeight = Math.max(finalHeight, 50);
            const headerBottomY = headerTopY - headerHeight;

            const logoY = headerBottomY + (headerHeight - finalHeight) / 2;
            page.drawImage(logoImage, {
              x: margin,
              y: logoY,
              width: finalWidth,
              height: finalHeight,
            });

            const titleStartX = margin + finalWidth + 18;
            const line1 = 'CONTRATO DE PRESTAÇÃO DE';
            const line2 = 'SERVIÇO DE TRANSPORTE';
            const titleFontSize = 13;
            const headerCenterY = headerBottomY + headerHeight / 2;

            page.drawText(line1, {
              x: titleStartX,
              y: headerCenterY + 3,
              size: titleFontSize,
              font: fontBold,
            });

            page.drawText(line2, {
              x: titleStartX,
              y: headerCenterY - 12,
              size: titleFontSize,
              font: fontBold,
            });

            const dividerY = headerBottomY - 8;
            page.drawLine({
              start: { x: margin, y: dividerY },
              end: { x: 545, y: dividerY },
              thickness: 0.5,
              color: rgb(0.8, 0.8, 0.8),
            });

            currentY = dividerY - 18;
          }
        }
      } catch (e) {
        console.error('Error embedding driver logo', e);
      }
    }

    if (currentY === 800) {
      page.drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TRANSPORTE', { x: margin, y: 770, size: fontSizeTitle, font: fontBold });
      currentY = 730;
    }

    const drawHeader = (title: string, y: number) => {
      page.drawText(title, { x: margin, y, size: fontSizeHeader, font: fontBold });
      page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: 545, y: y - 5 }, thickness: 0.5, color: rgb(0, 0, 0) });
      return y - 20;
    };

    const maskDoc = (doc?: string | null) => {
      if (!doc) return '';
      const clean = doc.replace(/\D/g, '');
      return clean.length > 11 ? maskCnpj(clean) : maskCpf(clean);
    };

    const smallTextSize = 10;
    const rowLineHeight = 13.5;
    const itemSpacing = 2;
    const sectionSpacing = 14;

    const drawFullWidthRow = (text: string, y: number, isBold = false) => {
      const fontToUse = isBold ? fontBold : font;
      const lines = this.splitTextToLines(text, fontToUse, smallTextSize, width);
      let localY = y;
      for (const line of lines) {
        page.drawText(line, { x: margin, y: localY, size: smallTextSize, font: fontToUse });
        localY -= rowLineHeight;
      }
      return localY - itemSpacing;
    };

    const drawTwoColumnRow = (leftText: string, rightText: string, y: number) => {
      const leftLines = leftText ? this.splitTextToLines(leftText, font, smallTextSize, 240) : [];
      const rightLines = rightText ? this.splitTextToLines(rightText, font, smallTextSize, 245) : [];
      const maxLines = Math.max(leftLines.length, rightLines.length, 1);

      for (let i = 0; i < leftLines.length; i++) {
        page.drawText(leftLines[i], { x: margin, y: y - (i * rowLineHeight), size: smallTextSize, font });
      }

      for (let i = 0; i < rightLines.length; i++) {
        page.drawText(rightLines[i], { x: 300, y: y - (i * rowLineHeight), size: smallTextSize, font });
      }

      return y - (maxLines * rowLineHeight) - itemSpacing;
    };

    currentY = drawHeader('DAS PARTES', currentY);

    // CONTRATANTE
    currentY = drawFullWidthRow('CONTRATANTE (Responsável)', currentY, true);
    currentY = drawFullWidthRow(`Nome: ${dados.nomeResponsavel || ''}`, currentY);
    currentY = drawTwoColumnRow(
      `Documento: ${maskCpf(dados.cpfResponsavel)}`,
      `Telefone: ${maskPhone(dados.telefoneResponsavel)}`,
      currentY
    );
    currentY = drawFullWidthRow(`Parentesco: ${formatParentesco(dados.parentescoResponsavel || '')}`, currentY);

    currentY -= (sectionSpacing - 4);

    // PRESTADOR(A)
    currentY = drawFullWidthRow('PRESTADOR(A) DE SERVIÇOS DE TRANSPORTE', currentY, true);
    currentY = drawFullWidthRow(`Nome: ${dados.nomeCondutor || ''}`, currentY);
    currentY = drawTwoColumnRow(
      `Documento: ${maskDoc(dados.cpfCnpjCondutor)}`,
      `Telefone: ${maskPhone(dados.telefoneCondutor)}`,
      currentY
    );

    currentY -= sectionSpacing;

    currentY = drawHeader('ALUNO(A)', currentY);
    currentY = drawTwoColumnRow(
      `Nome: ${dados.nomePassageiro || ''}`,
      `Escola: ${dados.nomeEscola || ''}`,
      currentY
    );
    currentY = drawTwoColumnRow(
      `Período: ${formatPeriodo(dados.periodo)}`,
      `Modalidade: ${formatModalidade(dados.modalidade)}`,
      currentY
    );
    currentY = drawFullWidthRow(`Endereço: ${dados.enderecoCompleto || ''}`, currentY);

    currentY -= sectionSpacing;

    currentY = drawHeader('VEÍCULO', currentY);
    currentY = drawTwoColumnRow(
      `Modelo: ${dados.modeloVeiculo || ''}`,
      `Placa: ${dados.placaVeiculo || ''}`,
      currentY
    );

    currentY -= sectionSpacing;

    currentY = drawHeader('DO PERÍODO DO CONTRATO', currentY);
    const currentYear = getNowBR().getFullYear();

    const formatMonthYear = (dateStr?: string) => {
      if (!dateStr) return "-";
      const parts = dateStr.split("-");
      if (parts.length < 2) return "-";
      return `${parts[1].padStart(2, '0')}/${parts[0]}`;
    };

    currentY = drawFullWidthRow(`Ano Letivo: ${dados.ano || currentYear}`, currentY);
    currentY = drawTwoColumnRow(
      `Início do Transporte: ${formatToBrazilianDate(dados.dataInicio)}`,
      `Término do Transporte: ${formatToBrazilianDate(dados.dataFim)}`,
      currentY
    );
    currentY = drawTwoColumnRow(
      `Horário de Entrada: ${dados.horarioEntrada || ''}`,
      `Horário de Saída: ${dados.horarioSaida || ''}`,
      currentY
    );
    currentY = drawTwoColumnRow(
      `Primeira Parcela: ${formatMonthYear(dados.dataInicioCobranca)}`,
      `Última Parcela: ${formatMonthYear(dados.dataFimCobranca)}`,
      currentY
    );

    currentY -= sectionSpacing;

    currentY = drawHeader('DAS CONDIÇÕES DE VALOR', currentY);
    currentY = drawTwoColumnRow(
      `Valor total do contrato (R$): ${(dados.valorTotal ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}`,
      `Quantidade de parcelas: ${dados.qtdParcelas ?? 0}`,
      currentY
    );
    currentY = drawTwoColumnRow(
      `Valor das parcelas (R$): ${(dados.valorParcela ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}`,
      `Dia do vencimento: ${dados.diaVencimento ?? '-'}`,
      currentY
    );

    const formatMulta = (tipo: ContractMultaTipo, valor: number) => {
      if (tipo === ContractMultaTipo.PERCENTUAL) {
        return valor.toLocaleString("pt-BR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }) + '%';
      }
      return valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    };

    const multaAtrasoTexto = (dados.multaAtraso && dados.multaAtraso.valor > 0)
      ? `Multa por atraso de pagamento (${dados.multaAtraso.tipo === ContractMultaTipo.PERCENTUAL ? '%' : 'R$'}): ${formatMulta(dados.multaAtraso.tipo, dados.multaAtraso.valor)}`
      : 'Multa por atraso de pagamento:';

    const multaRescisaoTexto = (dados.multaRescisao && dados.multaRescisao.valor > 0)
      ? `Multa por rescisão de contrato (${dados.multaRescisao.tipo === ContractMultaTipo.PERCENTUAL ? '%' : 'R$'}): ${formatMulta(dados.multaRescisao.tipo, dados.multaRescisao.valor)}`
      : 'Multa por rescisão de contrato:';

    currentY = drawTwoColumnRow(multaAtrasoTexto, multaRescisaoTexto, currentY);

    const jurosAtrasoTexto = (dados.jurosAtraso && dados.jurosAtraso.valor > 0)
      ? `${dados.jurosAtraso.tipo === ContractMultaTipo.PERCENTUAL ? 'Juros de mora (atraso):' : 'Juros de mora diário:'} ${formatMulta(dados.jurosAtraso.tipo, dados.jurosAtraso.valor)}${dados.jurosAtraso.tipo === ContractMultaTipo.PERCENTUAL ? ' ao mês' : ' / dia'}`
      : 'Juros de mora (atraso):';

    currentY = drawFullWidthRow(jurosAtrasoTexto, currentY);

    currentY -= sectionSpacing;

    const intro = "As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Transportes Escolares, sob as cláusulas e as seguintes condições.";
    const introLines = await this.splitTextToLines(intro, fontItalic, fontSizeBody, width);
    for (const line of introLines) {
      if (currentY < 50) {
        page = pdfDoc.addPage([595, 842]);
        currentY = 800;
      }
      page.drawText(line, { x: margin, y: currentY, size: fontSizeBody, font: fontItalic });
      currentY -= lineHeight;
    }

    currentY -= 10;

    // Processamento Dinâmico de Seções e Cláusulas
    let sections: { title: string; clauses: string[] }[] = [];
    if (dados.secoes && dados.secoes.length > 0) {
      sections = dados.secoes
        .map((s) => ({
          title: (s.titulo && s.titulo.trim()) ? s.titulo.trim().toUpperCase() : "SEÇÃO SEM TÍTULO",
          clauses: (s.clausulas || []).filter((c) => c && c.trim() !== ""),
        }))
        .filter((s) => s.clauses.length > 0);
    } else if (dados.clausulas && dados.clausulas.length > 0) {
      sections = [
        {
          title: "DA PRESTAÇÃO DO SERVIÇO",
          clauses: dados.clausulas.filter((c) => c && c.trim() !== ""),
        },
      ];
    } else {
      sections = [];
    }

    let clauseCounter = 1;

    for (const section of sections) {
      currentY -= 14;

      let firstClauseHeight = 60;
      if (section.clauses.length > 0) {
        const firstClauseText = `Cláusula ${clauseCounter}ª - ${section.clauses[0]}`;
        const firstClauseLines = await this.splitTextToLines(firstClauseText, font, fontSizeBody, width);
        firstClauseHeight = firstClauseLines.length * lineHeight + (lineHeight / 2);
      }

      const totalSectionHeaderSpace = (headerSpacing + 6) + firstClauseHeight + 12;

      if (currentY - totalSectionHeaderSpace < 45) {
        page = pdfDoc.addPage([595, 842]);
        currentY = 800;
      }

      page.drawText(section.title, { x: margin, y: currentY, size: fontSizeHeader, font: fontBold });
      currentY -= (headerSpacing + 6);

      for (const clausula of section.clauses) {
        const text = `Cláusula ${clauseCounter}ª - ${clausula}`;
        const lines = await this.splitTextToLines(text, font, fontSizeBody, width);

        if (currentY - (lines.length * lineHeight) < 50) {
          page = pdfDoc.addPage([595, 842]);
          currentY = 800;
        }

        for (const line of lines) {
          if (line.startsWith(`Cláusula ${clauseCounter}ª`)) {
            const prefix = `Cláusula ${clauseCounter}ª`;
            const rest = line.substring(prefix.length);
            page.drawText(prefix, { x: margin, y: currentY, size: fontSizeBody, font: fontBold });
            page.drawText(rest, { x: margin + fontBold.widthOfTextAtSize(prefix, fontSizeBody), y: currentY, size: fontSizeBody, font });
          } else {
            page.drawText(line, { x: margin, y: currentY, size: fontSizeBody, font });
          }
          currentY -= lineHeight;
        }
        currentY -= (lineHeight / 2);
        clauseCounter++;
      }

      currentY -= 14;
    }

    if (currentY < 155) {
      page = pdfDoc.addPage([595, 842]);
      currentY = 800;
    }

    currentY -= 30;
    const today = getNowBR().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    page.drawText(`${today}`, { x: margin, y: currentY, size: smallTextSize, font });
    currentY -= 68;

    // Linhas de Assinatura
    const signatureLineY = currentY;
    page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1 });
    page.drawLine({ start: { x: 335, y: currentY }, end: { x: 545, y: currentY }, thickness: 1 });

    // Salvar posição Y nos metadados para uso posterior
    pdfDoc.setKeywords([`SIG_Y:${signatureLineY}`]);

    currentY -= 15;

    page.drawText(`CONTRATADO(A)`, { x: margin, y: currentY, size: 9, font: fontBold });
    page.drawText(`CONTRATANTE`, { x: 335, y: currentY, size: 9, font: fontBold });

    if (dados.assinaturaCondutorUrl) {
      try {
        const imageBuffer = await resolveImageBuffer(dados.assinaturaCondutorUrl);
        if (imageBuffer) {
          const signatureImage = await embedImageSafely(pdfDoc, imageBuffer);
          if (signatureImage) {
            const { width: imgW, height: imgH } = signatureImage;
            const targetWidth = 150;
            const targetHeight = (imgH / imgW) * targetWidth;
            const maxHeight = 50;
            const finalHeight = Math.min(targetHeight, maxHeight);
            const finalWidth = (imgW / imgH) * finalHeight;
            page.drawImage(signatureImage, {
              x: margin,
              y: signatureLineY + 2,
              width: finalWidth,
              height: finalHeight,
            });
          }
        }
      } catch (e) {
        console.error('Error signature', e);
      }
    }

    // ADICIONAR LOGO NO FIM DA PÁGINA (CENTRALIZADO)
    try {
      const logoPath = path.resolve(process.cwd(), "assets", "images", "logo-van360.png");
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoBytes);
        const logoDims = logoImage.scale(0.3);

        const pageWidth = 595;
        const logoX = (pageWidth - logoDims.width) / 2;
        const logoY = 60; // Logo positioned at bottom

        page.drawImage(logoImage, { x: logoX, y: logoY, width: logoDims.width, height: logoDims.height });
      }
    } catch (e) {
      console.error('Erro logo', e);
    }

    return pdfDoc;
  }

  private async adicionarRodapeAuditoria(pdfDoc: PDFDocument, params: ContractSignatureParams): Promise<void> {
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const dataOriginal = params.metadados.timestamp ? parseLocalDate(params.metadados.timestamp) : getNowBR();
    const dataFormatada = dataOriginal.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });


    const text = `Assinado pelo CONTRATANTE (${params.nomeAssinante}) em ${dataFormatada} | IP: ${params.metadados.ip}`;
    lastPage.drawText(text, { x: 50, y: 30, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  }
}
