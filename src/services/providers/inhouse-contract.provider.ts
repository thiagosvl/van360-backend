import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { formatDate, formatModalidade, formatParentesco, formatPeriodo, maskCnpj, maskCpf, maskPhone } from '../../utils/format.js';

import { supabaseAdmin } from '../../config/supabase.js';
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
    
    const { error } = await supabaseAdmin.storage
      .from('contratos')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('contratos')
      .getPublicUrl(fileName);
    
    return {
      documentUrl: publicUrl,
    };
  }

  async processarAssinatura(params: ContractSignatureParams): Promise<ContractSignatureResponse> {
    const { data: contrato, error } = await supabaseAdmin
      .from('contratos')
      .select('minuta_url, dados_contrato')
      .eq('id', params.contratoId)
      .single();
    
    if (error || !contrato) throw new Error('Contrato não encontrado');
    
    const minutaPath = contrato.minuta_url.split('/contratos/')[1];
    const { data: pdfBuffer, error: downloadError } = await supabaseAdmin.storage
      .from('contratos')
      .download(minutaPath);
    
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
      const assinaturaBytes = Buffer.from(params.assinaturaBase64.split(',')[1], 'base64');
      const assinaturaImage = await pdfDoc.embedPng(assinaturaBytes);
      const pages = pdfDoc.getPages();
      const ultimaPagina = pages[pages.length - 1];
      
      // Ajuste fino: A imagem deve ficar um pouco acima da linha (y)
      // Se signatureY é a linha, a imagem começa um pouco acima.
      // drawImage usa y como canto inferior esquerdo.
      const imageY = signatureY + 2; 

      ultimaPagina.drawImage(assinaturaImage, {
        x: 350,
        y: imageY,
        width: 150,
        height: 50,
      });
    }
    
    await this.adicionarRodapeAuditoria(pdfDoc, {
      ...params,
      nomeAssinante: params.nomeAssinante || contrato.dados_contrato.nomeResponsavel
    });
    
    const finalPdfBytes = await pdfDoc.save();
    const finalFileName = `assinados/${params.contratoId}.pdf`;
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos')
      .upload(finalFileName, finalPdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('contratos')
      .getPublicUrl(finalFileName);
    
    return {
      documentoFinalUrl: publicUrl,
      assinadoEm: new Date().toISOString(),
    };
  }

  async consultarStatus(contratoId: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .single();
    if (error) throw error;
    return data;
  }

  async baixarDocumento(contratoId: string): Promise<Buffer> {
    const { data: contrato } = await supabaseAdmin
      .from('contratos')
      .select('contrato_final_url')
      .eq('id', contratoId)
      .single();
    if (!contrato?.contrato_final_url) throw new Error('Documento não encontrado');
    const pathDownload = contrato.contrato_final_url.split('/contratos/')[1];
    const { data: pdfBuffer } = await supabaseAdmin.storage
      .from('contratos')
      .download(pathDownload);
    if (!pdfBuffer) throw new Error('Erro ao baixar documento');
    return Buffer.from(await pdfBuffer.arrayBuffer());
  }

  private async splitTextToLines(text: string, font: any, size: number, maxWidth: number): Promise<string[]> {
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const paragraph of paragraphs) {
      const words = paragraph.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width > maxWidth) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);
    }
    return lines;
  }

  private groupClauses(clausulas: string[]) {
    // Helper to identify clause groups based on content keywords or order
    const sections: { title: string; clauses: string[] }[] = [
      { title: 'DO OBJETO', clauses: [] },
      { title: 'DA PRESTAÇÃO DO SERVIÇO', clauses: [] },
      { title: 'DO VALOR', clauses: [] },
      { title: 'DA RESCISÃO', clauses: [] },
      { title: 'DAS DISPOSIÇÕES FINAIS', clauses: [] },
      { title: 'CLÁUSULAS ADICIONAIS', clauses: [] }
    ];

    clausulas.forEach(clausula => {
      const c = clausula.toLowerCase();
      
      // DO OBJETO
      if (c.includes('consiste no transporte')) {
        sections[0].clauses.push(clausula);
      } 
      // DA PRESTAÇÃO DO SERVIÇO (Clauses 2-11)
      else if (
          c.includes('somente o passageiro') || 
          c.includes('horário regular') || 
          c.includes('retirada e entrega') || 
          c.includes('segurança do passageiro') || 
          c.includes('horários previamente combinados') || 
          c.includes('buscá-lo no lugar') || 
          c.includes('informar a contratada') || 
          c.includes('consumo de alimentos') || 
          c.includes('doença infectocontagiosa') || 
          c.includes('duas vistorias anuais') || 
          c.includes('veículo passa por duas vistorias')
      ) {
        sections[1].clauses.push(clausula);
      } 
      // DO VALOR (Clauses 12-14)
      else if (
          c.includes('pagará à contratada') || 
          c.includes('parcelas deverão ser pagas') || 
          c.includes('reajuste da mensalidade')
      ) {
        sections[2].clauses.push(clausula);
      } 
      // DA RESCISÃO (Clauses 15-16)
      else if (
          c.includes('comportamento inadequado') || 
          c.includes('rescindido imotivadamente')
      ) {
        sections[3].clauses.push(clausula);
      } 
      // DAS DISPOSIÇÕES FINAIS (Clauses 17-19)
      else if (
          c.includes('vigilância de objetos') || 
          c.includes('título executivo') || 
          c.includes('serviço do transporte escolar será prestado')
      ) {
        sections[4].clauses.push(clausula);
      } 
      // ADICIONAIS
      else {
        sections[5].clauses.push(clausula);
      }
    });

    // Remove empty sections
    return sections.filter(s => s.clauses.length > 0);
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
    const width = 495; // Largura útil

    page.drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TRANSPORTE', { x: margin, y: 770, size: fontSizeTitle, font: fontBold });
    currentY = 730;

    // Helper de Header com cor preta (removendo azul)
    const drawHeader = (title: string, y: number) => {
      // Cor removida (default black)
      page.drawText(title, { x: margin, y, size: fontSizeHeader, font: fontBold }); 
      page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: 545, y: y - 5 }, thickness: 0.5, color: rgb(0, 0, 0) });
      return y - 30; // Espaçamento um pouco maior
    };

// ...

    // Helper para mascarar doc genérico
    const maskDoc = (doc: string) => {
        if (!doc) return '';
        const clean = doc.replace(/\D/g, '');
        return clean.length > 11 ? maskCnpj(clean) : maskCpf(clean);
    };

    currentY = drawHeader('DAS PARTES', currentY);
    
    const smallTextSize = 10;
    
    // CONTRATANTE
    page.drawText('CONTRATANTE (Responsável)', { x: margin, y: currentY, size: smallTextSize, font: fontBold });
    page.drawText(`Nome: ${dados.nomeResponsavel}`, { x: margin, y: currentY - 14, size: smallTextSize, font });
    page.drawText(`Documento (CPF): ${maskCpf(dados.cpfResponsavel)}`, { x: margin, y: currentY - 28, size: smallTextSize, font });
    page.drawText(`Telefone: ${maskPhone(dados.telefoneResponsavel)}`, { x: 300, y: currentY - 28, size: smallTextSize, font });
    page.drawText(`Parentesco do Passageiro: ${formatParentesco(dados.parentescoResponsavel || '')}`, { x: margin, y: currentY - 42, size: smallTextSize, font });
    
    currentY -= 65;

    // CONTRATADA
    page.drawText('CONTRATADA (Transportador)', { x: margin, y: currentY, size: smallTextSize, font: fontBold });
    page.drawText(`Nome: ${dados.apelidoCondutor || dados.nomeCondutor}`, { x: margin, y: currentY - 14, size: smallTextSize, font });
    page.drawText(`Documento (CPF/CNPJ): ${maskDoc(dados.cpfCnpjCondutor)}`, { x: margin, y: currentY - 28, size: smallTextSize, font });
    page.drawText(`Telefone: ${maskPhone(dados.telefoneCondutor)}`, { x: 300, y: currentY - 28, size: smallTextSize, font });
    
    currentY -= 50;

    currentY = drawHeader('PASSAGEIRO(A)', currentY);
    page.drawText(`Nome: ${dados.nomePassageiro}`, { x: margin, y: currentY, size: smallTextSize, font });
    page.drawText(`Escola: ${dados.nomeEscola}`, { x: 300, y: currentY, size: smallTextSize, font });
    
    page.drawText(`Período: ${formatPeriodo(dados.periodo)}`, { x: margin, y: currentY - 14, size: smallTextSize, font });
    page.drawText(`Modalidade: ${formatModalidade(dados.modalidade)}`, { x: 300, y: currentY - 14, size: smallTextSize, font });
    
    page.drawText(`Endereço: ${dados.enderecoCompleto}`, { x: margin, y: currentY - 28, size: smallTextSize, font });
    
    currentY -= 50; // Adjusted spacing

    currentY = drawHeader('VEÍCULO', currentY);
    page.drawText(`Modelo: ${dados.modeloVeiculo}`, { x: margin, y: currentY, size: smallTextSize, font });
    page.drawText(`Placa: ${dados.placaVeiculo}`, { x: 300, y: currentY, size: smallTextSize, font });
    currentY -= 30;

    currentY = drawHeader('DO PERÍODO DO CONTRATO', currentY);
    const currentYear = new Date().getFullYear();
    page.drawText(`Ano Letivo: ${dados.ano || currentYear}`, { x: margin, y: currentY, size: smallTextSize, font });
    page.drawText(`Início: ${formatDate(dados.dataInicio)}`, { x: margin, y: currentY - 14, size: smallTextSize, font });
    page.drawText(`Término: ${formatDate(dados.dataFim)}`, { x: 300, y: currentY - 14, size: smallTextSize, font });
    currentY -= 45;

    currentY = drawHeader('DAS CONDIÇÕES DE VALOR', currentY);
    page.drawText(`Valor total do contrato (R$): ${dados.valorTotal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}`, { x: margin, y: currentY, size: smallTextSize, font });
    page.drawText(`Quantidade de parcelas: ${dados.qtdParcelas}`, { x: 300, y: currentY, size: smallTextSize, font });
    page.drawText(`Valor das parcelas (R$): ${dados.valorParcela.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}`, { x: margin, y: currentY - 14, size: smallTextSize, font });
    page.drawText(`Dia do vencimento: ${dados.diaVencimento}`, { x: 300, y: currentY - 14, size: smallTextSize, font });
    
    // Lógica para formatação de valores de multas
    const formatMulta = (tipo: ContractMultaTipo, valor: number) => {
        if (tipo === ContractMultaTipo.PERCENTUAL) {
            return valor.toFixed(0).replace('.', ',')+'%'; // Sem decimais se %
        }
        return valor.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }); // Com decimais se R$
    };

    const multaAtrasoLabel = `Multa mensal atraso de pagamento (${dados.multaAtraso.tipo === ContractMultaTipo.PERCENTUAL ? '%' : 'R$'}):`;
    const multaAtrasoValor = formatMulta(dados.multaAtraso.tipo, dados.multaAtraso.valor);
    page.drawText(`${multaAtrasoLabel} ${multaAtrasoValor}`, { x: margin, y: currentY - 28, size: smallTextSize, font });
    
    const multaRescisaoLabel = `Multa cancelamento de contrato (${dados.multaRescisao.tipo === ContractMultaTipo.PERCENTUAL ? '%' : 'R$'}):`;
    const multaRescisaoValor = formatMulta(dados.multaRescisao.tipo, dados.multaRescisao.valor);
    page.drawText(`${multaRescisaoLabel} ${multaRescisaoValor}`, { x: 300, y: currentY - 28, size: smallTextSize, font });
    currentY -= 60;

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
    
    currentY -= 15;

    // Grouping Clauses
    const clausulasRaw = dados.clausulas || ["Serviço de transporte acordado."];
    const sections = this.groupClauses(clausulasRaw);
    
    let clauseCounter = 1;

    for (const section of sections) {
        // Draw Section Header
        if (currentY < 80) {
            page = pdfDoc.addPage([595, 842]);
            currentY = 800;
        }
        
        currentY -= 10;
        page.drawText(section.title, { x: margin, y: currentY, size: fontSizeHeader, font: fontBold });
        currentY -= headerSpacing;

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
             currentY -= (lineHeight / 2); // Espaço extra entre cláusulas
             clauseCounter++;
        }
    }

    if (currentY < 200) { // Garantir espaço para assinaturas
        page = pdfDoc.addPage([595, 842]);
        currentY = 800;
    }
    
    currentY -= 40;
    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    
    page.drawText(`${today}`, { x: margin, y: currentY, size: smallTextSize, font });
    currentY -= 80; // Mais espaço para assinar
    
    // Linhas de Assinatura
    const signatureLineY = currentY;
    page.drawLine({ start: { x: margin, y: currentY }, end: { x: margin + 200, y: currentY }, thickness: 1 });
    page.drawLine({ start: { x: 335, y: currentY }, end: { x: 545, y: currentY }, thickness: 1 });
    
    // Salvar posição Y nos metadados para uso posterior
    pdfDoc.setKeywords([`SIG_Y:${signatureLineY}`]);

    currentY -= 15;
    
    page.drawText(`CONTRATADA (${dados.apelidoCondutor || 'Motorista'})`, { x: margin, y: currentY, size: 9, font: fontBold });
    page.drawText(`CONTRATANTE (${dados.nomeResponsavel || 'Responsável'})`, { x: 335, y: currentY, size: 9, font: fontBold });

    if (dados.assinaturaCondutorUrl) {
        try {
            const resp = await fetch(dados.assinaturaCondutorUrl);
            const signatureBytes = await resp.arrayBuffer();
            const signatureImage = await pdfDoc.embedPng(signatureBytes);
            // Melhor posicionamento da assinatura do motorista (usando a mesma referência Y da linha)
            page.drawImage(signatureImage, { x: margin, y: signatureLineY + 2, width: 150, height: 50 });
        } catch (e) { console.error('Error signature', e); }
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

    const dataOriginal = new Date(params.metadados.timestamp);
    const dataFormatada = dataOriginal.toLocaleString('pt-BR', { 
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
