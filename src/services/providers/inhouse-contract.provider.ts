import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  ContractProvider,
  ContractGenerationParams,
  ContractGenerationResponse,
  ContractSignatureParams,
  ContractSignatureResponse,
  DadosContrato,
} from '../../types/contract.js';
import { supabaseAdmin } from '../../config/supabase.js';

export class InHouseContractProvider implements ContractProvider {
  name = 'inhouse';

  async gerarContrato(params: ContractGenerationParams): Promise<ContractGenerationResponse> {
    // 1. Criar PDF base
    const pdfDoc = await this.criarPdfBase(params.dadosContrato);
    
    // 2. Salvar minuta no Supabase Storage
    const pdfBytes = await pdfDoc.save();
    const fileName = `minutas/${params.contratoId}.pdf`;
    
    const { error } = await supabaseAdmin.storage
      .from('contratos')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    
    if (error) throw error;
    
    // 3. Obter URL pública
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('contratos')
      .getPublicUrl(fileName);
    
    return {
      documentUrl: publicUrl,
    };
  }

  async processarAssinatura(params: ContractSignatureParams): Promise<ContractSignatureResponse> {
    // 1. Buscar contrato no banco
    const { data: contrato, error } = await supabaseAdmin
      .from('contratos')
      .select('minuta_url, dados_contrato')
      .eq('id', params.contratoId)
      .single();
    
    if (error || !contrato) throw new Error('Contrato não encontrado');
    
    // 2. Baixar PDF da minuta
    const minutaPath = contrato.minuta_url.split('/contratos/')[1];
    const { data: pdfBuffer, error: downloadError } = await supabaseAdmin.storage
      .from('contratos')
      .download(minutaPath);
    
    if (downloadError) throw downloadError;
    
    // 3. Carregar PDF e inserir assinatura
    const pdfBytes = await pdfBuffer.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Inserir imagem da assinatura
    if (params.assinaturaBase64) {
      const assinaturaBytes = Buffer.from(params.assinaturaBase64.split(',')[1], 'base64');
      const assinaturaImage = await pdfDoc.embedPng(assinaturaBytes);
      
      const pages = pdfDoc.getPages();
      const ultimaPagina = pages[pages.length - 1];
      
      ultimaPagina.drawImage(assinaturaImage, {
        x: 50,
        y: 150,
        width: 200,
        height: 80,
      });
    }
    
    // 4. Adicionar rodapé com metadados
    await this.adicionarRodapeAuditoria(pdfDoc, params);
    
    // 5. Salvar PDF final
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

  async cancelarContrato(contratoId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('contratos')
      .update({ status: 'cancelado' })
      .eq('id', contratoId);
    
    return !error;
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
    
    const path = contrato.contrato_final_url.split('/contratos/')[1];
    const { data: pdfBuffer } = await supabaseAdmin.storage
      .from('contratos')
      .download(path);
    
    if (!pdfBuffer) throw new Error('Erro ao baixar documento');
    
    return Buffer.from(await pdfBuffer.arrayBuffer());
  }

  private async criarPdfBase(dados: DadosContrato): Promise<PDFDocument> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = 800;
    
    // Título
    page.drawText('CONTRATO DE PRESTACAO DE SERVICO DE TRANSPORTE', {
      x: 50,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    
    y -= 40;
    
    // Dados das partes
    page.drawText('DAS PARTES', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
    });
    
    y -= 25;
    
    page.drawText('CONTRATANTE', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
    });
    
    y -= 15;
    page.drawText(`Nome: ${dados.nomeResponsavel}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`CPF: ${dados.cpfResponsavel}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Telefone: ${dados.telefoneResponsavel}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Parentesco do Aluno: Responsavel`, { x: 50, y, size: 10, font });
    
    y -= 25;
    
    page.drawText('CONTRATADA', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
    });
    
    y -= 15;
    page.drawText(`Nome: ${dados.nomeCondutor}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`CPF/CNPJ: ${dados.cpfCnpjCondutor}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Telefone: ${dados.telefoneCondutor}`, { x: 50, y, size: 10, font });
    
    y -= 25;
    
    page.drawText('ALUNO(A)', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
    });
    
    y -= 15;
    page.drawText(`Nome: ${dados.nomeAluno}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Escola: ${dados.nomeEscola}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Periodo: ${dados.periodo}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Endereco: ${dados.enderecoCompleto}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Modalidade: ${dados.modalidade}`, { x: 50, y, size: 10, font });
    
    y -= 25;
    
    page.drawText('DO PERIODO DO CONTRATO', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
    });
    
    y -= 20;
    page.drawText(`Inicio: ${dados.dataInicio}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Fim: ${dados.dataFim}`, { x: 50, y, size: 10, font });
    
    y -= 25;
    
    page.drawText('DAS CONDICOES DE VALOR', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
    });
    
    y -= 20;
    page.drawText(`Valor total do contrato (R$): ${dados.valorMensal.toFixed(2)}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Quantidade de parcelas: 12`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Valor das parcelas (R$): ${dados.valorMensal.toFixed(2)}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Dia do vencimento: ${dados.diaVencimento}`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Multa mensal para atraso de pagamento (%): 10.00`, { x: 50, y, size: 10, font });
    y -= 15;
    page.drawText(`Multa para cancelamento de contrato (%): 15.00`, { x: 50, y, size: 10, font });
    
    y -= 30;
    
    // Cláusulas
    const clausulas = [
      'As partes acima identificadas tem, entre si, justo e acertado o presente Contrato de',
      'Prestacao de Servico de Transporte que se regera pelas clausulas seguintes e pelas',
      'condicoes descritas no presente. As partes elegem o foro da comarca de residencia do',
      'CONTRATANTE para dirimir quaisquer questoes decorrentes do presente contrato.'
    ];
    
    clausulas.forEach(clausula => {
      page.drawText(clausula, { x: 50, y, size: 9, font });
      y -= 12;
    });
    
    return pdfDoc;
  }

  private async adicionarRodapeAuditoria(pdfDoc: PDFDocument, params: ContractSignatureParams): Promise<void> {
    const pages = pdfDoc.getPages();
    const ultimaPagina = pages[pages.length - 1];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const textoAuditoria = `Assinado digitalmente em ${params.metadados.timestamp} | IP: ${params.metadados.ip}`;
    
    ultimaPagina.drawText(textoAuditoria, {
      x: 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}
