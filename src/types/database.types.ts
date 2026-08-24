export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_updates: {
        Row: {
          changelog: string | null
          created_at: string | null
          force_update: boolean | null
          id: string
          latest_version: string
          platform: string
          url_zip: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string | null
          force_update?: boolean | null
          id?: string
          latest_version: string
          platform: string
          url_zip: string
        }
        Update: {
          changelog?: string | null
          created_at?: string | null
          force_update?: boolean | null
          id?: string
          latest_version?: string
          platform?: string
          url_zip?: string
        }
        Relationships: []
      }
      assinatura_faturas: {
        Row: {
          assinatura_id: string
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          gateway_txid: string | null
          id: string
          metodo_pagamento: string
          parcelas: number
          pix_copy_paste: string | null
          plano_id: string | null
          status: string
          updated_at: string | null
          usuario_id: string
          valor: number
          valor_parcela: number | null
          valor_total: number | null
        }
        Insert: {
          assinatura_id: string
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          gateway_txid?: string | null
          id?: string
          metodo_pagamento: string
          parcelas?: number
          pix_copy_paste?: string | null
          plano_id?: string | null
          status?: string
          updated_at?: string | null
          usuario_id: string
          valor: number
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Update: {
          assinatura_id?: string
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          gateway_txid?: string | null
          id?: string
          metodo_pagamento?: string
          parcelas?: number
          pix_copy_paste?: string | null
          plano_id?: string | null
          status?: string
          updated_at?: string | null
          usuario_id?: string
          valor?: number
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_faturas_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_faturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_faturas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      assinatura_notificacoes: {
        Row: {
          ciclo_referencia: string
          enviado_em: string | null
          id: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          ciclo_referencia: string
          enviado_em?: string | null
          id?: string
          tipo: string
          usuario_id: string
        }
        Update: {
          ciclo_referencia?: string
          enviado_em?: string | null
          id?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          created_at: string | null
          data_fim_promocao: string | null
          data_inicio: string | null
          data_vencimento: string | null
          gateway_subscription_id: string | null
          id: string
          metodo_pagamento: string | null
          metodo_pagamento_preferencial_id: string | null
          plano_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string | null
          usuario_id: string
          valor_base_anual: number | null
          valor_base_mensal: number | null
          valor_promocional_anual: number | null
          valor_promocional_mensal: number | null
        }
        Insert: {
          created_at?: string | null
          data_fim_promocao?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          gateway_subscription_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          metodo_pagamento_preferencial_id?: string | null
          plano_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          usuario_id: string
          valor_base_anual?: number | null
          valor_base_mensal?: number | null
          valor_promocional_anual?: number | null
          valor_promocional_mensal?: number | null
        }
        Update: {
          created_at?: string | null
          data_fim_promocao?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          gateway_subscription_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          metodo_pagamento_preferencial_id?: string | null
          plano_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
          usuario_id?: string
          valor_base_anual?: number | null
          valor_base_mensal?: number | null
          valor_promocional_anual?: number | null
          valor_promocional_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_metodo_pagamento_preferencial_id_fkey"
            columns: ["metodo_pagamento_preferencial_id"]
            isOneToOne: false
            referencedRelation: "metodos_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          ano: number
          created_at: string
          data_envio_ultima_notificacao: string | null
          data_pagamento: string | null
          data_vencimento: string
          desativar_lembretes: boolean
          id: string
          mes: number
          origem: string
          pagamento_manual: boolean | null
          passageiro_id: string
          recibo_url: string | null
          status: string
          tipo_pagamento:
            | Database["public"]["Enums"]["tipo_pagamento_enum"]
            | null
          updated_at: string
          usuario_id: string | null
          valor: number
          valor_pago: number | null
        }
        Insert: {
          ano: number
          created_at?: string
          data_envio_ultima_notificacao?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          desativar_lembretes?: boolean
          id?: string
          mes: number
          origem?: string
          pagamento_manual?: boolean | null
          passageiro_id: string
          recibo_url?: string | null
          status?: string
          tipo_pagamento?:
            | Database["public"]["Enums"]["tipo_pagamento_enum"]
            | null
          updated_at?: string
          usuario_id?: string | null
          valor: number
          valor_pago?: number | null
        }
        Update: {
          ano?: number
          created_at?: string
          data_envio_ultima_notificacao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          desativar_lembretes?: boolean
          id?: string
          mes?: number
          origem?: string
          pagamento_manual?: boolean | null
          passageiro_id?: string
          recibo_url?: string | null
          status?: string
          tipo_pagamento?:
            | Database["public"]["Enums"]["tipo_pagamento_enum"]
            | null
          updated_at?: string
          usuario_id?: string | null
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_interna: {
        Row: {
          chave: string
          id: number
          valor: string
        }
        Insert: {
          chave: string
          id?: number
          valor: string
        }
        Update: {
          chave?: string
          id?: number
          valor?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          ano: number | null
          assinado_em: string | null
          assinatura_metadados: Json | null
          contrato_final_url: string | null
          created_at: string
          dados_contrato: Json
          data_fim: string | null
          data_inicio: string | null
          dia_vencimento: number | null
          expira_em: string | null
          id: string
          juros_atraso_tipo: string | null
          juros_atraso_valor: number | null
          minuta_url: string | null
          multa_atraso_tipo: string | null
          multa_atraso_valor: number | null
          multa_rescisao_tipo: string | null
          multa_rescisao_valor: number | null
          passageiro_id: string
          provider: string
          provider_document_id: string | null
          provider_link_assinatura: string | null
          qtd_parcelas: number | null
          status: string
          token_acesso: string
          updated_at: string
          usuario_id: string
          valor_parcela: number | null
          valor_total: number | null
        }
        Insert: {
          ano?: number | null
          assinado_em?: string | null
          assinatura_metadados?: Json | null
          contrato_final_url?: string | null
          created_at?: string
          dados_contrato: Json
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento?: number | null
          expira_em?: string | null
          id?: string
          juros_atraso_tipo?: string | null
          juros_atraso_valor?: number | null
          minuta_url?: string | null
          multa_atraso_tipo?: string | null
          multa_atraso_valor?: number | null
          multa_rescisao_tipo?: string | null
          multa_rescisao_valor?: number | null
          passageiro_id: string
          provider?: string
          provider_document_id?: string | null
          provider_link_assinatura?: string | null
          qtd_parcelas?: number | null
          status?: string
          token_acesso: string
          updated_at?: string
          usuario_id: string
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Update: {
          ano?: number | null
          assinado_em?: string | null
          assinatura_metadados?: Json | null
          contrato_final_url?: string | null
          created_at?: string
          dados_contrato?: Json
          data_fim?: string | null
          data_inicio?: string | null
          dia_vencimento?: number | null
          expira_em?: string | null
          id?: string
          juros_atraso_tipo?: string | null
          juros_atraso_valor?: number | null
          minuta_url?: string | null
          multa_atraso_tipo?: string | null
          multa_atraso_valor?: number | null
          multa_rescisao_tipo?: string | null
          multa_rescisao_valor?: number | null
          passageiro_id?: string
          provider?: string
          provider_document_id?: string | null
          provider_link_assinatura?: string | null
          qtd_parcelas?: number | null
          status?: string
          token_acesso?: string
          updated_at?: string
          usuario_id?: string
          valor_parcela?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      escolas: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          estado: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          referencia: string | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          referencia?: string | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          referencia?: string | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escolas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes_rota: {
        Row: {
          created_at: string
          finalizada_em: string | null
          id: string
          iniciada_em: string
          notificar_conclusao_parada: boolean
          notificar_inicio_rota: boolean
          notificar_pais: boolean
          notificar_proxima_parada: boolean
          rastreamento_ativo: boolean
          rastreamento_modo: string
          rota_id: string
          status: Database["public"]["Enums"]["execucao_rota_status_enum"]
          usuario_id: string
        }
        Insert: {
          created_at?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          notificar_conclusao_parada?: boolean
          notificar_inicio_rota?: boolean
          notificar_pais?: boolean
          notificar_proxima_parada?: boolean
          rastreamento_ativo?: boolean
          rastreamento_modo?: string
          rota_id: string
          status?: Database["public"]["Enums"]["execucao_rota_status_enum"]
          usuario_id: string
        }
        Update: {
          created_at?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          notificar_conclusao_parada?: boolean
          notificar_inicio_rota?: boolean
          notificar_pais?: boolean
          notificar_proxima_parada?: boolean
          rastreamento_ativo?: boolean
          rastreamento_modo?: string
          rota_id?: string
          status?: Database["public"]["Enums"]["execucao_rota_status_enum"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_rota_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_rota_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes_rota_passageiros: {
        Row: {
          created_at: string
          escola_id: string | null
          execucao_rota_id: string
          id: string
          notificacao_a_caminho_enviada: boolean
          notificacao_concluido_enviada: boolean
          notificacao_inicio_enviada: boolean
          notificado_em: string | null
          ordem: number
          passageiro_id: string | null
          sentido: string | null
          status: Database["public"]["Enums"]["execucao_passageiro_status_enum"]
          tipo_no: Database["public"]["Enums"]["tipo_no_rota_enum"]
          visitado_em: string | null
        }
        Insert: {
          created_at?: string
          escola_id?: string | null
          execucao_rota_id: string
          id?: string
          notificacao_a_caminho_enviada?: boolean
          notificacao_concluido_enviada?: boolean
          notificacao_inicio_enviada?: boolean
          notificado_em?: string | null
          ordem: number
          passageiro_id?: string | null
          sentido?: string | null
          status?: Database["public"]["Enums"]["execucao_passageiro_status_enum"]
          tipo_no?: Database["public"]["Enums"]["tipo_no_rota_enum"]
          visitado_em?: string | null
        }
        Update: {
          created_at?: string
          escola_id?: string | null
          execucao_rota_id?: string
          id?: string
          notificacao_a_caminho_enviada?: boolean
          notificacao_concluido_enviada?: boolean
          notificacao_inicio_enviada?: boolean
          notificado_em?: string | null
          ordem?: number
          passageiro_id?: string | null
          sentido?: string | null
          status?: Database["public"]["Enums"]["execucao_passageiro_status_enum"]
          tipo_no?: Database["public"]["Enums"]["tipo_no_rota_enum"]
          visitado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_rota_passageiros_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_rota_passageiros_execucao_rota_id_fkey"
            columns: ["execucao_rota_id"]
            isOneToOne: false
            referencedRelation: "execucoes_rota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_rota_passageiros_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_notificacoes: {
        Row: {
          canal: string
          created_at: string | null
          destinatario: string
          erro_mensagem: string | null
          evento: string
          id: string
          max_tentativas: number
          payload: Json
          provider_message_id: string | null
          proxima_tentativa_em: string
          status: string
          tentativas: number
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          canal: string
          created_at?: string | null
          destinatario: string
          erro_mensagem?: string | null
          evento: string
          id?: string
          max_tentativas?: number
          payload: Json
          provider_message_id?: string | null
          proxima_tentativa_em?: string
          status?: string
          tentativas?: number
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          canal?: string
          created_at?: string | null
          destinatario?: string
          erro_mensagem?: string | null
          evento?: string
          id?: string
          max_tentativas?: number
          payload?: Json
          provider_message_id?: string | null
          proxima_tentativa_em?: string
          status?: string
          tentativas?: number
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fila_notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      gasto_categorias: {
        Row: {
          cor: string
          created_at: string | null
          icone: string
          id: string
          nome: string
          slug: string
          usuario_id: string | null
        }
        Insert: {
          cor?: string
          created_at?: string | null
          icone?: string
          id?: string
          nome: string
          slug: string
          usuario_id?: string | null
        }
        Update: {
          cor?: string
          created_at?: string | null
          icone?: string
          id?: string
          nome?: string
          slug?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_categorias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          created_at: string | null
          data: string
          descricao: string | null
          id: string
          numero_parcela: number | null
          parcelamento_id: string | null
          total_parcelas: number | null
          usuario_id: string | null
          valor: number
          veiculo_id: string | null
        }
        Insert: {
          categoria: string
          created_at?: string | null
          data: string
          descricao?: string | null
          id?: string
          numero_parcela?: number | null
          parcelamento_id?: string | null
          total_parcelas?: number | null
          usuario_id?: string | null
          valor: number
          veiculo_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string | null
          data?: string
          descricao?: string | null
          id?: string
          numero_parcela?: number | null
          parcelamento_id?: string | null
          total_parcelas?: number | null
          usuario_id?: string | null
          valor?: number
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_atividades: {
        Row: {
          acao: string
          created_at: string
          descricao: string
          entidade_id: string
          entidade_tipo: string
          id: string
          ip_address: string | null
          meta: Json | null
          usuario_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          descricao: string
          entidade_id: string
          entidade_tipo: string
          id?: string
          ip_address?: string | null
          meta?: Json | null
          usuario_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          descricao?: string
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          ip_address?: string | null
          meta?: Json | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_atividades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      indicacoes: {
        Row: {
          created_at: string | null
          fatura_origem_id: string | null
          id: string
          indicado_id: string | null
          indicador_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fatura_origem_id?: string | null
          id?: string
          indicado_id?: string | null
          indicador_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fatura_origem_id?: string | null
          id?: string
          indicado_id?: string | null
          indicador_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_indicado_id_fkey"
            columns: ["indicado_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      metodos_pagamento: {
        Row: {
          brand: string | null
          created_at: string
          expire_month: string
          expire_year: string
          id: string
          is_default: boolean | null
          last_4_digits: string
          payment_token: string
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          expire_month: string
          expire_year: string
          id?: string
          is_default?: boolean | null
          last_4_digits: string
          payment_token: string
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          expire_month?: string
          expire_year?: string
          id?: string
          is_default?: boolean | null
          last_4_digits?: string
          payment_token?: string
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metodos_pagamento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      passageiro_ausencias: {
        Row: {
          created_at: string
          data_ausencia: string
          id: string
          motivo: string | null
          passageiro_id: string
          registrado_por: string | null
          sentido: string | null
          turno: string
        }
        Insert: {
          created_at?: string
          data_ausencia: string
          id?: string
          motivo?: string | null
          passageiro_id: string
          registrado_por?: string | null
          sentido?: string | null
          turno: string
        }
        Update: {
          created_at?: string
          data_ausencia?: string
          id?: string
          motivo?: string | null
          passageiro_id?: string
          registrado_por?: string | null
          sentido?: string | null
          turno?: string
        }
        Relationships: [
          {
            foreignKeyName: "passageiro_ausencias_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passageiro_ausencias_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      passageiro_responsaveis: {
        Row: {
          created_at: string | null
          id: string
          parentesco: string | null
          passageiro_id: string
          responsavel_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          parentesco?: string | null
          passageiro_id: string
          responsavel_id: string
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          parentesco?: string | null
          passageiro_id?: string
          responsavel_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passageiro_responsaveis_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passageiro_responsaveis_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
        ]
      }
      passageiros: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim_cobranca: string | null
          data_fim_transporte: string | null
          data_inicio_cobranca: string | null
          data_inicio_transporte: string | null
          data_nascimento: string | null
          dia_vencimento: number | null
          enviar_notificacoes: boolean
          escola_id: string
          genero: Database["public"]["Enums"]["genero_enum"] | null
          id: string
          isento: boolean
          modalidade: Database["public"]["Enums"]["modalidade_enum"] | null
          nome: string
          nome_professor: string | null
          observacoes: string | null
          periodo: string | null
          turma: string | null
          updated_at: string
          usuario_id: string
          valor_cobranca: number | null
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim_cobranca?: string | null
          data_fim_transporte?: string | null
          data_inicio_cobranca?: string | null
          data_inicio_transporte?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          enviar_notificacoes?: boolean
          escola_id: string
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          id?: string
          isento?: boolean
          modalidade?: Database["public"]["Enums"]["modalidade_enum"] | null
          nome: string
          nome_professor?: string | null
          observacoes?: string | null
          periodo?: string | null
          turma?: string | null
          updated_at?: string
          usuario_id: string
          valor_cobranca?: number | null
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim_cobranca?: string | null
          data_fim_transporte?: string | null
          data_inicio_cobranca?: string | null
          data_inicio_transporte?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          enviar_notificacoes?: boolean
          escola_id?: string
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          id?: string
          isento?: boolean
          modalidade?: Database["public"]["Enums"]["modalidade_enum"] | null
          nome?: string
          nome_professor?: string | null
          observacoes?: string | null
          periodo?: string | null
          turma?: string | null
          updated_at?: string
          usuario_id?: string
          valor_cobranca?: number | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passageiros_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passageiros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passageiros_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          identificador: string
          nome: string
          updated_at: string | null
          valor: number
          valor_promocional: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          identificador: string
          nome: string
          updated_at?: string | null
          valor: number
          valor_promocional?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          identificador?: string
          nome?: string
          updated_at?: string | null
          valor?: number
          valor_promocional?: number | null
        }
        Relationships: []
      }
      pre_passageiros: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf_responsavel: string | null
          created_at: string
          data_fim_transporte: string | null
          data_inicio_transporte: string | null
          data_nascimento: string | null
          dia_vencimento: number | null
          email_responsavel: string | null
          escola_id: string | null
          estado: string | null
          genero: Database["public"]["Enums"]["genero_enum"] | null
          id: string
          logradouro: string | null
          modalidade: Database["public"]["Enums"]["modalidade_enum"] | null
          nome: string
          nome_professor: string | null
          nome_responsavel: string
          numero: string | null
          observacoes: string | null
          parentesco_responsavel:
            | Database["public"]["Enums"]["parentesco_enum"]
            | null
          periodo: string | null
          referencia: string | null
          telefone_responsavel: string
          turma: string | null
          updated_at: string
          usuario_id: string
          valor_cobranca: number | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_responsavel?: string | null
          created_at?: string
          data_fim_transporte?: string | null
          data_inicio_transporte?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          email_responsavel?: string | null
          escola_id?: string | null
          estado?: string | null
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          id?: string
          logradouro?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_enum"] | null
          nome: string
          nome_professor?: string | null
          nome_responsavel: string
          numero?: string | null
          observacoes?: string | null
          parentesco_responsavel?:
            | Database["public"]["Enums"]["parentesco_enum"]
            | null
          periodo?: string | null
          referencia?: string | null
          telefone_responsavel: string
          turma?: string | null
          updated_at?: string
          usuario_id: string
          valor_cobranca?: number | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf_responsavel?: string | null
          created_at?: string
          data_fim_transporte?: string | null
          data_inicio_transporte?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          email_responsavel?: string | null
          escola_id?: string | null
          estado?: string | null
          genero?: Database["public"]["Enums"]["genero_enum"] | null
          id?: string
          logradouro?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_enum"] | null
          nome?: string
          nome_professor?: string | null
          nome_responsavel?: string
          numero?: string | null
          observacoes?: string | null
          parentesco_responsavel?:
            | Database["public"]["Enums"]["parentesco_enum"]
            | null
          periodo?: string | null
          referencia?: string | null
          telefone_responsavel?: string
          turma?: string | null
          updated_at?: string
          usuario_id?: string
          valor_cobranca?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_passageiros_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_passageiros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      recuperacoes_senha: {
        Row: {
          codigo: string
          created_at: string
          expira_em: string
          id: string
          usado: boolean
          usuario_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          expira_em: string
          id?: string
          usado?: boolean
          usuario_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          expira_em?: string
          id?: string
          usado?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recuperacoes_senha_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      responsaveis: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          estado: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          pin_acesso: string | null
          referencia: string | null
          telefone: string
          updated_at: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          pin_acesso?: string | null
          referencia?: string | null
          telefone: string
          updated_at?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          pin_acesso?: string | null
          referencia?: string | null
          telefone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rota_ausencias: {
        Row: {
          created_at: string
          data_ausencia: string
          id: string
          passageiro_id: string
          registrado_por: string | null
          rota_id: string
          sentido: string | null
        }
        Insert: {
          created_at?: string
          data_ausencia: string
          id?: string
          passageiro_id: string
          registrado_por?: string | null
          rota_id: string
          sentido?: string | null
        }
        Update: {
          created_at?: string
          data_ausencia?: string
          id?: string
          passageiro_id?: string
          registrado_por?: string | null
          rota_id?: string
          sentido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rota_ausencias_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_ausencias_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_ausencias_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_passageiros: {
        Row: {
          created_at: string
          escola_id: string | null
          id: string
          ordem: number
          passageiro_id: string | null
          rota_id: string
          sentido: string | null
          tipo_no: Database["public"]["Enums"]["tipo_no_rota_enum"]
        }
        Insert: {
          created_at?: string
          escola_id?: string | null
          id?: string
          ordem: number
          passageiro_id?: string | null
          rota_id: string
          sentido?: string | null
          tipo_no?: Database["public"]["Enums"]["tipo_no_rota_enum"]
        }
        Update: {
          created_at?: string
          escola_id?: string | null
          id?: string
          ordem?: number
          passageiro_id?: string | null
          rota_id?: string
          sentido?: string | null
          tipo_no?: Database["public"]["Enums"]["tipo_no_rota_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "rota_passageiros_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_passageiros_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_passageiros_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
          usuario_id: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          usuario_id: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          usuario_id?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      tentativas_login: {
        Row: {
          created_at: string | null
          dispositivo: string | null
          id: string
          ip: string | null
          login_tentado: string
          motivo_falha: string | null
          sucesso: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          dispositivo?: string | null
          id?: string
          ip?: string | null
          login_tentado: string
          motivo_falha?: string | null
          sucesso?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          dispositivo?: string | null
          id?: string
          ip?: string | null
          login_tentado?: string
          motivo_falha?: string | null
          sucesso?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      usuario_configuracoes: {
        Row: {
          cobranca_atraso_3_dias_ativo: boolean
          cobranca_atraso_5_dias_ativo: boolean
          cobranca_atraso_7_dias_ativo: boolean
          cobranca_aviso_previo_ativo: boolean
          cobranca_dias_aviso_previo: number | null
          cobranca_vencimento_hoje_ativo: boolean
          created_at: string
          notificar_conclusao_parada: boolean
          notificar_inicio_rota: boolean
          notificar_motorista_aniversarios: boolean
          notificar_motorista_parcelas: boolean
          notificar_pais_cobrancas: boolean
          notificar_proxima_parada: boolean
          rastreamento_ativo: boolean
          rastreamento_modo: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          cobranca_atraso_3_dias_ativo?: boolean
          cobranca_atraso_5_dias_ativo?: boolean
          cobranca_atraso_7_dias_ativo?: boolean
          cobranca_aviso_previo_ativo?: boolean
          cobranca_dias_aviso_previo?: number | null
          cobranca_vencimento_hoje_ativo?: boolean
          created_at?: string
          notificar_conclusao_parada?: boolean
          notificar_inicio_rota?: boolean
          notificar_motorista_aniversarios?: boolean
          notificar_motorista_parcelas?: boolean
          notificar_pais_cobrancas?: boolean
          notificar_proxima_parada?: boolean
          rastreamento_ativo?: boolean
          rastreamento_modo?: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          cobranca_atraso_3_dias_ativo?: boolean
          cobranca_atraso_5_dias_ativo?: boolean
          cobranca_atraso_7_dias_ativo?: boolean
          cobranca_aviso_previo_ativo?: boolean
          cobranca_dias_aviso_previo?: number | null
          cobranca_vencimento_hoje_ativo?: boolean
          created_at?: string
          notificar_conclusao_parada?: boolean
          notificar_inicio_rota?: boolean
          notificar_motorista_aniversarios?: boolean
          notificar_motorista_parcelas?: boolean
          notificar_pais_cobrancas?: boolean
          notificar_proxima_parada?: boolean
          rastreamento_ativo?: boolean
          rastreamento_modo?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_configuracoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          apelido: string | null
          assinatura_digital_url: string | null
          ativo: boolean | null
          bairro: string | null
          canal_aquisicao: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          config_contrato: Json | null
          conta_pai_id: string | null
          cpfcnpj: string
          created_at: string
          data_nascimento: string | null
          dispositivo_cadastro: string | null
          email: string
          estado: string | null
          id: string
          logradouro: string | null
          metadados_cadastro: Json | null
          nome: string
          numero: string | null
          razao_social: string | null
          telefone: string
          termos_aceitos_em: string | null
          termos_versao: string | null
          tipo: Database["public"]["Enums"]["user_type_enum"]
          tipo_chave_pix: string | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          apelido?: string | null
          assinatura_digital_url?: string | null
          ativo?: boolean | null
          bairro?: string | null
          canal_aquisicao?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          config_contrato?: Json | null
          conta_pai_id?: string | null
          cpfcnpj: string
          created_at?: string
          data_nascimento?: string | null
          dispositivo_cadastro?: string | null
          email: string
          estado?: string | null
          id: string
          logradouro?: string | null
          metadados_cadastro?: Json | null
          nome: string
          numero?: string | null
          razao_social?: string | null
          telefone: string
          termos_aceitos_em?: string | null
          termos_versao?: string | null
          tipo?: Database["public"]["Enums"]["user_type_enum"]
          tipo_chave_pix?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          apelido?: string | null
          assinatura_digital_url?: string | null
          ativo?: boolean | null
          bairro?: string | null
          canal_aquisicao?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          config_contrato?: Json | null
          conta_pai_id?: string | null
          cpfcnpj?: string
          created_at?: string
          data_nascimento?: string | null
          dispositivo_cadastro?: string | null
          email?: string
          estado?: string | null
          id?: string
          logradouro?: string | null
          metadados_cadastro?: Json | null
          nome?: string
          numero?: string | null
          razao_social?: string | null
          telefone?: string
          termos_aceitos_em?: string | null
          termos_versao?: string | null
          tipo?: Database["public"]["Enums"]["user_type_enum"]
          tipo_chave_pix?: string | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_conta_pai_id_fkey"
            columns: ["conta_pai_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          marca: string
          modelo: string
          placa: string
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          marca: string
          modelo: string
          placa: string
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          marca?: string
          modelo?: string
          placa?: string
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          description: string | null
          id: string
          instance_name: string
          is_active: boolean
          is_default_for_purpose: boolean
          purpose: Database["public"]["Enums"]["whatsapp_purpose_enum"]
          rate_limit_duration: number | null
          rate_limit_max: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          instance_name: string
          is_active?: boolean
          is_default_for_purpose?: boolean
          purpose?: Database["public"]["Enums"]["whatsapp_purpose_enum"]
          rate_limit_duration?: number | null
          rate_limit_max?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          instance_name?: string
          is_active?: boolean
          is_default_for_purpose?: boolean
          purpose?: Database["public"]["Enums"]["whatsapp_purpose_enum"]
          rate_limit_duration?: number | null
          rate_limit_max?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: { Args: { data: string }; Returns: string }
      confirm_invoice_payment: { Args: { p_fatura_id: string }; Returns: Json }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      execucao_passageiro_status_enum: "pendente" | "embarcado" | "ausente"
      execucao_rota_status_enum: "iniciada" | "concluida" | "cancelada"
      genero_enum: "masculino" | "feminino" | "prefiro_nao_informar"
      modalidade_enum: "ida" | "volta" | "ida_volta"
      parentesco_enum:
        | "pai"
        | "mae"
        | "avo"
        | "tio"
        | "irmao"
        | "primo"
        | "padrastro"
        | "madrasta"
        | "responsavel_legal"
        | "outro"
      tipo_no_rota_enum: "passageiro" | "escola"
      tipo_pagamento_enum:
        | "dinheiro"
        | "cartao-credito"
        | "cartao-debito"
        | "transferencia"
        | "PIX"
        | "boleto"
      user_type_enum:
        | "admin"
        | "motorista"
        | "motorista_auxiliar"
        | "monitor"
        | "responsavel"
      whatsapp_purpose_enum: "TRANSACTIONAL" | "BULK"
      whatsapp_status_enum:
        | "CONNECTED"
        | "DISCONNECTED"
        | "CONNECTING"
        | "UNKNOWN"
        | "NOT_FOUND"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      execucao_passageiro_status_enum: ["pendente", "embarcado", "ausente"],
      execucao_rota_status_enum: ["iniciada", "concluida", "cancelada"],
      genero_enum: ["masculino", "feminino", "prefiro_nao_informar"],
      modalidade_enum: ["ida", "volta", "ida_volta"],
      parentesco_enum: [
        "pai",
        "mae",
        "avo",
        "tio",
        "irmao",
        "primo",
        "padrastro",
        "madrasta",
        "responsavel_legal",
        "outro",
      ],
      tipo_no_rota_enum: ["passageiro", "escola"],
      tipo_pagamento_enum: [
        "dinheiro",
        "cartao-credito",
        "cartao-debito",
        "transferencia",
        "PIX",
        "boleto",
      ],
      user_type_enum: [
        "admin",
        "motorista",
        "motorista_auxiliar",
        "monitor",
        "responsavel",
      ],
      whatsapp_purpose_enum: ["TRANSACTIONAL", "BULK"],
      whatsapp_status_enum: [
        "CONNECTED",
        "DISCONNECTED",
        "CONNECTING",
        "UNKNOWN",
        "NOT_FOUND",
      ],
    },
  },
} as const
