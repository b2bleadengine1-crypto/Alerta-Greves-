#!/usr/bin/env python3
"""
GrevesPT - Motor de Extração de Dados de Greves
Módulo: ai_parser.py
Tecnologias: Python 3, Pydantic v2, Google GenAI SDK (google-genai)
Modelo: gemini-2.5-flash (Structured Outputs via response_schema)
"""

import os
import sys
import json
import re
import hashlib
from datetime import datetime
from enum import Enum
from typing import Optional, Union, List
from pydantic import BaseModel, Field, field_validator, model_validator

# Tenta importar o SDK oficial moderno do Google GenAI
try:
    from google import genai
    from google.genai import types
    from google.genai.errors import APIError
except ImportError:
    genai = None
    types = None
    APIError = Exception


# ==============================================================================
# 1. ENUMS E ESQUEMA PYDANTIC (GreveSchema)
# ==============================================================================

class SetorEnum(str, Enum):
    TRANSPORTES = 'Transportes'
    EDUCACAO = 'Educação'
    SAUDE = 'Saúde'
    FUNCAO_PUBLICA = 'Função Pública'
    OUTRO = 'Outro'


class RegiaoEnum(str, Enum):
    NACIONAL = 'Nacional'
    AML_LISBOA = 'AML - Lisboa'
    MARGEM_SUL = 'Margem Sul'
    AMP_PORTO = 'AMP - Porto'
    REGIONAL = 'Regional'


class EstadoEnum(str, Enum):
    PRE_AVISO = 'Pré-Aviso'
    CONFIRMADA = 'Confirmada'
    DESCONVOCADA = 'Desconvocada'


class ImpactoPrevistoEnum(str, Enum):
    ALTO = 'Alto'
    MEDIO = 'Médio'
    BAIXO = 'Baixo'


class GreveSchema(BaseModel):
    """
    Schema Pydantic estrito para validação e extração estruturada de greves.
    Compatível com o parâmetro `response_schema` do Google GenAI SDK.
    """
    id_unico: str = Field(
        description="Identificador hash único ou slug determinístico derivado da empresa e data_inicio"
    )
    empresa_ou_entidade: str = Field(
        description="Nome oficial da empresa pública, privada ou serviço estatal afetado (ex: CP - Comboios de Portugal, Carris Metropolitana, Metro de Lisboa)"
    )
    setor: SetorEnum = Field(
        description="Setor de atividade laboral afetado"
    )
    regiao: RegiaoEnum = Field(
        description="Âmbito geográfico do impacto da greve em Portugal"
    )
    data_inicio: str = Field(
        description="Data de início da paralisação no formato estrito YYYY-MM-DD. Nunca inventar ou alucinar datas não mencionadas."
    )
    data_fim: str = Field(
        description="Data de conclusão da paralisação no formato estrito YYYY-MM-DD. Se a greve for de 24h num só dia, deve ser igual à data_inicio."
    )
    horario_afetado: str = Field(
        description="Horário ou período específico da paralisação (ex: '00h00 às 24h00', 'Horas de ponta das 07h às 10h e das 17h às 20h')"
    )
    estado: EstadoEnum = Field(
        description="Fase e situação jurídica da greve (Pré-Aviso emitido, Confirmada com realização certa, ou Desconvocada)"
    )
    servicos_minimos: str = Field(
        description="Resumo claro dos serviços mínimos fixados pelo CES, Tribunal Arbitral ou acordo sindical. Indicar 'Sem serviços mínimos decretados' se for o caso."
    )
    impacto_previsto: ImpactoPrevistoEnum = Field(
        description="Gravidade e perturbação estimada na rotina dos utentes"
    )
    fonte_url: str = Field(
        description="URL da notícia, comunicado oficial ou portal de onde o texto foi extraído"
    )

    @field_validator('data_inicio', 'data_fim')
    @classmethod
    def validar_formato_data(cls, valor: str) -> str:
        """Garante conformidade com o formato ISO YYYY-MM-DD e existência no calendário gregoriano."""
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', valor.strip()):
            raise ValueError(f"Formato de data inválido: '{valor}'. Deve ser rigorosamente YYYY-MM-DD.")
        try:
            datetime.strptime(valor.strip(), '%Y-%m-%d')
        except ValueError as err:
            raise ValueError(f"Data inexistente no calendário: '{valor}' ({err}).")
        return valor.strip()

    @model_validator(mode='after')
    def validar_consistencia_e_gerar_hash(self):
        """Valida que data_fim não é anterior a data_inicio e garante id_unico determinístico."""
        d_inicio = datetime.strptime(self.data_inicio, '%Y-%m-%d')
        d_fim = datetime.strptime(self.data_fim, '%Y-%m-%d')
        if d_fim < d_inicio:
            raise ValueError(
                f"Data de fim ({self.data_fim}) não pode ser anterior à data de início ({self.data_inicio})."
            )

        # Gera hash determinístico SHA-256 de 12 caracteres caso o id_unico esteja vazio ou genérico
        empresa_norm = re.sub(r'[^a-zA-Z0-9]', '', self.empresa_ou_entidade.lower())
        hash_raw = f"{empresa_norm}_{self.data_inicio}".encode('utf-8')
        hash_digest = hashlib.sha256(hash_raw).hexdigest()[:12]
        
        if not self.id_unico or len(self.id_unico) < 4:
            self.id_unico = f"{empresa_norm[:8]}-{self.data_inicio.replace('-', '')}-{hash_digest[:4]}"

        return self


class GrevesBatchSchema(BaseModel):
    """Esquema para textos/notícias que contenham mais de uma convocação ou paralisação simultânea."""
    greves: List[GreveSchema] = Field(
        description="Lista de todas as greves ou paralisações identificadas no texto fornecido."
    )


# ==============================================================================
# 2. PROMPT E REGRAS ANTI-ALUCINAÇÃO
# ==============================================================================

SYSTEM_INSTRUCTION = """
És um motor analítico e jurídico especializado no sistema de relações laborais e transportes de Portugal (GrevesPT).
O teu objetivo é analisar comunicados sindicais (FECTRANS, SMAQ, CGTP, FENPROF, STOP, FNAM, etc.), avisos de empresas (CP, Carris, Metro, Transtejo, Fertagus, STCP) ou deliberações do CES (Conselho Económico e Social) / DGAEP, e extrair os dados estritamente estruturados de cada greve.

REGRAS RÍGIDAS CONTRA ALUCINAÇÃO DE DATAS E FACTOS:
1. Factualidade Absoluta: Extrai EXCLUSIVAMENTE informações comprovadas no texto. Nunca inventes sindicatos, empresas ou datas que não estejam no texto.
2. Tratamento Temporal Rigoroso:
   - Se o texto indicar dias da semana ou datas parciais (ex: "na próxima quarta-feira, dia 22"), correlaciona com o contexto temporal do documento sem alucinar anos futuros ou passados aleatórios.
   - As datas DEVEM estar no formato ISO 'YYYY-MM-DD'.
   - Se a paralisação ocorrer num único dia ou tiver duração de 24 horas, `data_fim` DEVE ser idêntica a `data_inicio`.
   - Se nenhuma data explícita for identificada no texto, não inventes números.
3. Classificação de Setor e Região:
   - Transportes: comboios, metros, autocarros, barcos, aeroportos, táxis.
   - Educação: professores, pessoal não docente, escolas, universidades.
   - Saúde: médicos, enfermeiros, técnicos de diagnóstico, hospitais, USF/centros de saúde.
   - Função Pública: conservatórias, segurança social, finanças, câmaras municipais, DGAEP.
   - AML - Lisboa: Lisboa, Sintra, Cascais, Loures, Amadora, Odivelas, Oeiras, Vila Franca de Xira, Mafra.
   - Margem Sul: Almada, Seixal, Barreiro, Setúbal, Sesimbra, Montijo, Palmela, Alcochete (inclui Fertagus e Transtejo/Soflusa).
   - AMP - Porto: Porto, Gaia, Matosinhos, Maia, Gondomar (inclui STCP e Metro do Porto).
4. Serviços Mínimos:
   - Resume de forma direta o teor acordado ou decretado pelo Tribunal Arbitral do CES (ex: percentagem de comboios, ligação a hospitais, urgências hospitalares a 100%).
5. Responde ESTRITAMENTE em conformidade com o schema JSON configurado, sem markdown envolvente nem texto adicional.
"""


# ==============================================================================
# 3. FUNÇÃO PRINCIPAL DE EXTRAÇÃO (ai_parser.py)
# ==============================================================================

def extract_strike_data(
    raw_text: str,
    fonte_url: str = "https://dados.gov.pt/avisos-greve",
    api_key: Optional[str] = None,
    allow_multiple: bool = False
) -> Union[GreveSchema, List[GreveSchema]]:
    """
    Recebe um texto bruto de notícia/comunicado em português, invoca o Gemini 2.5 Flash
    com Structured Outputs (response_schema) e devolve a greve validada pelo Pydantic.

    :param raw_text: Texto do comunicado sindical, notícia de jornal ou aviso oficial.
    :param fonte_url: URL de origem da notícia para auditoria.
    :param api_key: Chave de API do Gemini (se None, lê de GEMINI_API_KEY no ambiente).
    :param allow_multiple: Se True, extrai lista de greves usando GrevesBatchSchema.
    :return: Instância de GreveSchema (ou List[GreveSchema]).
    :raises ValueError: Para entradas inválidas ou falha de validação Pydantic.
    :raises RuntimeError: Para falhas de conectividade ou chave de API ausente.
    """
    if not raw_text or not raw_text.strip():
        raise ValueError("O texto bruto fornecido para análise está vazio.")

    # Resolução da API Key
    effective_api_key = api_key or os.environ.get("GEMINI_API_KEY")
    if not effective_api_key:
        raise RuntimeError(
            "Chave de API do Gemini não encontrada! "
            "Define a variável de ambiente GEMINI_API_KEY ou passa o parâmetro api_key."
        )

    if genai is None:
        raise RuntimeError(
            "O pacote oficial 'google-genai' não está instalado no ambiente Python. "
            "Instala com: pip install google-genai"
        )

    # Inicialização do cliente Google GenAI SDK com headers de telemetria
    client = genai.Client(
        api_key=effective_api_key,
        http_options={"headers": {"User-Agent": "aistudio-build"}}
    )

    # Escolha do schema de resposta
    target_schema = GrevesBatchSchema if allow_multiple else GreveSchema

    user_prompt = f"""Analisa com rigor o seguinte texto em português sobre relações laborais e greves.
URL de Origem Fornecida: {fonte_url}

--- TEXTO BRUTO PARA EXTRAÇÃO ---
{raw_text.strip()}
---------------------------------

Instrução de Extração:
Preenche todos os campos do schema JSON com exatidão factual.
Usa a URL de origem '{fonte_url}' no campo 'fonte_url' se o texto não contiver outra mais específica.
"""

    try:
        # Chamada ao modelo gemini-2.5-flash com Structured Outputs garantidos
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=target_schema,
                temperature=0.1,  # Temperatura baixa para máxima fidelidade e zero alucinação
            ),
        )

        raw_json_output = response.text
        if not raw_json_output:
            raise RuntimeError("O modelo Gemini devolveu uma resposta vazia.")

        # Parsing e validação com o Pydantic
        parsed_data = json.loads(raw_json_output)

        if allow_multiple:
            batch_result = GrevesBatchSchema.model_validate(parsed_data)
            return batch_result.greves
        else:
            single_result = GreveSchema.model_validate(parsed_data)
            return single_result

    except APIError as api_err:
        raise RuntimeError(f"Erro na API do Google Gemini: {api_err}") from api_err
    except json.JSONDecodeError as json_err:
        raise ValueError(f"O modelo não devolveu um JSON sintaticamente válido: {json_err}") from json_err
    except Exception as exc:
        raise RuntimeError(f"Falha inesperada no processamento da greve: {exc}") from exc


# ==============================================================================
# 4. EXECUÇÃO DE EXEMPLO E TESTE CLI
# ==============================================================================

if __name__ == "__main__":
    print("=" * 75)
    print("GrevesPT - Motor de Extração de Dados com Gemini 2.5 Flash")
    print("=" * 75)

    # Exemplo realista de comunicado sindical português
    SAMPLE_TEXT = """
    COMUNICADO CONJUNTO - FECTRANS / SMAQ
    Greve nos comboios da CP - Comboios de Portugal
    
    Os sindicatos representativos dos trabalhadores da CP - Comboios de Portugal
    (Sindicato Nacional dos Maquinistas dos Caminhos de Ferro Portugueses - SMAQ e FECTRANS)
    entregaram um pré-aviso de greve para o próximo dia 24 de outubro de 2026,
    com início às 00h00 e término às 24h00.
    
    A paralisação abrange todos os serviços da transportadora ferroviária nacional, incluindo
    os comboios Urbanos de Lisboa e Porto, Regionais, Intercidades e Alfa Pendular,
    com fortes perturbações em todo o território nacional.
    
    Na sequência do sorteio do Tribunal Arbitral no Conselho Económico e Social (CES),
    foram fixados serviços mínimos na ordem dos 25% da circulação habitual, com garantia
    adicional de transporte para composições de socorro e transporte de matérias perigosas.
    
    A greve é motivada pela exigência de cumprimento integral do Acordo de Empresa assinado
    com a tutela e pela atualização intercalar das tabelas salariais de maquinistas e revisores.
    """

    SAMPLE_URL = "https://www.fectrans.pt/comunicados/greve-cp-outubro-2026"

    # Verificação de ambiente
    api_key_env = os.environ.get("GEMINI_API_KEY")

    if not api_key_env:
        print("\n[INFO DE SIMULAÇÃO]")
        print("A variável de ambiente GEMINI_API_KEY não foi detetada.")
        print("A demonstrar a validação do Pydantic GreveSchema com dados locais:\n")
        
        # Simulação local demonstrativa do Schema
        mock_data = {
            "id_unico": "cp-20261024-smaq",
            "empresa_ou_entidade": "CP - Comboios de Portugal",
            "setor": "Transportes",
            "regiao": "Nacional",
            "data_inicio": "2026-10-24",
            "data_fim": "2026-10-24",
            "horario_afetado": "00h00 às 24h00 (24 horas)",
            "estado": "Confirmada",
            "servicos_minimos": "O Tribunal Arbitral do CES decretou serviços mínimos de 25% para comboios Urbanos de Lisboa e Porto, Regionais e Longo Curso.",
            "impacto_previsto": "Alto",
            "fonte_url": SAMPLE_URL
        }
        
        try:
            validada = GreveSchema.model_validate(mock_data)
            print("Resultado Pydantic Validado com Sucesso:")
            print(json.dumps(validada.model_dump(), indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"Erro na validação do mock: {e}")

    else:
        print("\nA processar extração via API do Gemini 2.5 Flash...")
        try:
            resultado = extract_strike_data(
                raw_text=SAMPLE_TEXT,
                fonte_url=SAMPLE_URL
            )
            print("\nExtração bem-sucedida! JSON Padronizado:")
            print(json.dumps(resultado.model_dump(), indent=2, ensure_ascii=False))
        except Exception as err:
            print(f"\n[ERRO]: {err}", file=sys.stderr)
            sys.exit(1)
