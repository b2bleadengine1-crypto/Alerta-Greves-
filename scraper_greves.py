#!/usr/bin/env python3
"""
GrevesPT - Scraper Automático e Pipeline de Ingestão de Greves
Módulo: scraper_greves.py
Tecnologias: Python 3, requests, BeautifulSoup4, feedparser, ai_parser (Gemini 2.5 Flash)

Fontes:
- Google News RSS (Portugal) com queries booleanas de operadores e termos de greve
- Avisos de Greve do Portal DGAEP / Comunicados Sindicais
- Sistema Anti-Duplicados com deteção de transições de estado
- Limpeza e arquivo automático de greves antigas (> 2 dias)
- Sincronização automática com a PWA (greves.json e public/greves.json)
"""

import os
import sys
import json
import re
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Tuple

import requests
from bs4 import BeautifulSoup
import feedparser

# Importa o extrator inteligente da Fase 2
try:
    from ai_parser import extract_strike_data, GreveSchema
except ImportError:
    GreveSchema = None
    extract_strike_data = None

# Importa o despachador de notificações da Fase 4
try:
    from notifier import notify_all_channels
except ImportError:
    notify_all_channels = None


# Constantes e Ficheiros de Dados
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT_DIR, "greves.json")
PUBLIC_DATA_FILE = os.path.join(ROOT_DIR, "public", "greves.json")
ARCHIVE_FILE = os.path.join(ROOT_DIR, "greves_arquivo.json")

# Configurações de Rede HTTP
HTTP_TIMEOUT = 12
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 GrevesPT-Bot/1.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
}

# Queries booleanas para o Google News RSS (Portugal)
NEWS_QUERIES = [
    '"pré-aviso de greve"',
    '"greve CP"',
    '"greve Carris"',
    '"greve Transtejo"',
    '"greve Fertagus"',
    '"greve Metro"',
    '"serviços mínimos greve"'
]


# ==============================================================================
# 1. CARREGAMENTO E PERSISTÊNCIA DE DADOS (Anti-Duplicados & Arquivo)
# ==============================================================================

def load_existing_strikes() -> List[Dict[str, Any]]:
    """Carrega os dados existentes do ficheiro greves.json com fallback seguro."""
    for path in [DATA_FILE, PUBLIC_DATA_FILE]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
            except Exception as e:
                print(f"[Aviso] Falha ao ler {path}: {e}", file=sys.stderr)
    return []


def save_strikes(strikes: List[Dict[str, Any]]) -> None:
    """Guarda a lista de greves atualizada na raiz e na pasta public/ para a PWA."""
    # Ordenar por data de início ascendente
    strikes_sorted = sorted(
        strikes,
        key=lambda s: s.get("dataInicio") or s.get("data_inicio") or "9999-99-99"
    )

    # 1. Guarda em greves.json
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(strikes_sorted, f, indent=2, ensure_ascii=False)

    # 2. Sincroniza em public/greves.json
    public_dir = os.path.dirname(PUBLIC_DATA_FILE)
    os.makedirs(public_dir, exist_ok=True)
    with open(PUBLIC_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(strikes_sorted, f, indent=2, ensure_ascii=False)

    print(f"[Armazenamento] {len(strikes_sorted)} greves ativas guardadas e sincronizadas.")


def archive_outdated_strikes(strikes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Remove do conjunto ativo greves cuja data_fim já tenha decorrido há mais de 2 dias.
    As greves removidas são adicionadas a greves_arquivo.json para fins de histórico.
    """
    agora = datetime.now()
    limite_arquivo = agora - timedelta(days=2)

    ativas: List[Dict[str, Any]] = []
    a_arquivar: List[Dict[str, Any]] = []

    for s in strikes:
        data_fim_str = s.get("dataFim") or s.get("data_fim")
        if not data_fim_str:
            ativas.append(s)
            continue

        # Normaliza caso venha com ISO timestamp
        data_fim_clean = data_fim_str.split("T")[0]
        try:
            data_fim_dt = datetime.strptime(data_fim_clean, "%Y-%m-%d")
            # Se a data de fim passou há mais de 2 dias
            if data_fim_dt < limite_arquivo:
                a_arquivar.append(s)
            else:
                ativas.append(s)
        except ValueError:
            ativas.append(s)

    # Se houver itens a arquivar, atualiza o ficheiro de arquivo
    if a_arquivar:
        arquivo_existente: List[Dict[str, Any]] = []
        if os.path.exists(ARCHIVE_FILE):
            try:
                with open(ARCHIVE_FILE, "r", encoding="utf-8") as af:
                    arquivo_existente = json.load(af)
            except Exception:
                arquivo_existente = []

        ids_arquivo = {x.get("id") or x.get("id_unico") for x in arquivo_existente}
        for item in a_arquivar:
            item_id = item.get("id") or item.get("id_unico")
            if item_id not in ids_arquivo:
                item["arquivadoEm"] = agora.isoformat()
                arquivo_existente.append(item)

        with open(ARCHIVE_FILE, "w", encoding="utf-8") as af:
            json.dump(arquivo_existente, af, indent=2, ensure_ascii=False)

        print(f"[Arquivo Automático] {len(a_arquivar)} greves expiradas (>2 dias) arquivadas com sucesso.")

    return ativas, len(a_arquivar)


# ==============================================================================
# 2. COLETORES DE FONTES (Google News RSS & DGAEP)
# ==============================================================================

def fetch_google_news_rss() -> List[Dict[str, str]]:
    """
    Efetua a busca nos feeds RSS do Google News para a edição de Portugal,
    usando a query booleana agregada.
    """
    query_str = " OR ".join(NEWS_QUERIES)
    encoded_query = urllib.parse.quote(query_str)
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=pt-PT&gl=PT&ceid=PT:pt-150"

    print(f"[RSS] A consultar Google News Portugal ({len(NEWS_QUERIES)} queries)...")
    artigos: List[Dict[str, str]] = []

    try:
        resp = requests.get(rss_url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT)
        if resp.status_code != 200:
            print(f"[RSS Erro] Google News retornou status {resp.status_code}", file=sys.stderr)
            return artigos

        feed = feedparser.parse(resp.content)
        for entry in feed.entries[:18]:  # Limitar aos artigos mais recentes
            titulo = getattr(entry, "title", "").strip()
            link = getattr(entry, "link", "").strip()
            summary = getattr(entry, "summary", "").strip()
            pub_date = getattr(entry, "published", "").strip()

            # Limpar tags HTML do summary
            summary_clean = BeautifulSoup(summary, "html.parser").get_text(separator=" ").strip()

            if titulo:
                artigos.append({
                    "titulo": titulo,
                    "link": link,
                    "resumo": summary_clean,
                    "dataPublicacao": pub_date,
                    "fonte": "Google News Portugal"
                })

        print(f"[RSS] {len(artigos)} notícias recentes recolhidas do Google News.")
    except Exception as e:
        print(f"[RSS Exceção] Falha ao recolher Google News RSS: {e}", file=sys.stderr)

    return artigos


def fetch_dgaep_avisos() -> List[Dict[str, str]]:
    """
    Estrutura pronta para raspagem da página de avisos prévios de greve da DGAEP
    (Direção-Geral da Administração e do Emprego Público).
    """
    dgaep_url = "https://www.dgaep.gov.pt"
    avisos: List[Dict[str, str]] = []

    try:
        # Acesso simulado com timeout
        resp = requests.get(
            f"{dgaep_url}/pt/relacoes-coletivas-de-trabalho/greves/",
            headers=HTTP_HEADERS,
            timeout=HTTP_TIMEOUT
        )
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            # Extração de itens em tabelas ou listas de avisos
            tabelas = soup.find_all("table")
            for tab in tabelas:
                linhas = tab.find_all("tr")[1:]  # Ignora cabeçalho
                for l in linhas:
                    colunas = [c.get_text(strip=True) for c in l.find_all(["td", "th"])]
                    if len(colunas) >= 3:
                        avisos.append({
                            "titulo": f"DGAEP Aviso: {colunas[0]}",
                            "resumo": " | ".join(colunas),
                            "link": dgaep_url,
                            "fonte": "DGAEP Oficial"
                        })
    except Exception as e:
        # Silencioso se indisponível (a DGAEP pode bloquear bots ou requerer VPN)
        print(f"[DGAEP Info] Conexão DGAEP indisponível ou protegida: {e}")

    return avisos


def fetch_article_full_text(url: str) -> Optional[str]:
    """Tenta descarregar o texto principal de uma notícia para dar maior contexto à IA."""
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=8)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            # Remove scripts, styles e menus
            for s in soup(["script", "style", "nav", "header", "footer", "aside"]):
                s.decompose()
            paragrafos = [p.get_text(strip=True) for p in soup.find_all("p")]
            texto_completo = " ".join(p for p in paragrafos if len(p) > 40)
            return texto_completo[:3000]  # Limite de segurança de tokens
    except Exception:
        pass
    return None


# ==============================================================================
# 3. CONVERSÃO E COMPATIBILIZAÇÃO COM O SCHEMA DA PWA
# ==============================================================================

def convert_schema_to_pwa_item(schema: "GreveSchema", noticia: Dict[str, str]) -> Dict[str, Any]:
    """
    Converte o objeto GreveSchema (Pydantic) no formato padronizado esperado pelo index.html
    da PWA GrevesPT, garantindo interoperabilidade entre o backend e a interface web.
    """
    empresa = schema.empresa_ou_entidade
    sigla = empresa
    for s in ["CP", "Carris Metropolitana", "Metro de Lisboa", "Fertagus", "Transtejo", "STCP", "SNS"]:
        if s.lower() in empresa.lower():
            sigla = s
            break

    # Mapeamento de gravidade para UI
    gravidade_map = {
        "Alto": "alta",
        "Médio": "media",
        "Baixo": "baixa"
    }

    # Estado formatado
    estado_ui = schema.estado.value
    if schema.servicos_minimos and "decretad" in schema.servicos_minimos.lower() and estado_ui != "Desconvocada":
        estado_ui = "Serviços Mínimos Decretados"

    return {
        "id": schema.id_unico,
        "empresa": schema.empresa_ou_entidade,
        "empresaSigla": sigla,
        "setor": schema.setor.value,
        "regiao": schema.regiao.value,
        "estado": estado_ui,
        "gravidade": gravidade_map.get(schema.impacto_previsto.value, "media"),
        "dataInicio": f"{schema.data_inicio}T00:00:00",
        "dataFim": f"{schema.data_fim}T23:59:59",
        "horario": schema.horario_afetado,
        "sindicato": "Sindicatos Representativos",
        "motivo": "Reivindicações laborais e salariais",
        "servicosMinimos": schema.servicos_minimos,
        "impacto": f"Impacto previsto {schema.impacto_previsto.value} na circulação e serviços normais.",
        "alternativas": "Consultar alternativas rodoviárias ou outros operadores da AML/região.",
        "fonteOficial": schema.fonte_url or noticia.get("link", "https://dados.gov.pt"),
        "fonteNome": noticia.get("fonte", "Fonte Oficial"),
        "atualizadoEm": datetime.now(timezone.utc).isoformat()
    }


# ==============================================================================
# 4. MOTOR PRINCIPAL DE PROCESSAMENTO ANTI-DUPLICADOS
# ==============================================================================

def run_scraper_pipeline() -> Dict[str, Any]:
    """
    Executa o ciclo completo de monitorização:
    1. Lê greves existentes e arquiva as antigas (>2 dias)
    2. Recolhe notícias recentes
    3. Passa pelo extrator Gemini AI
    4. Compara com os registos existentes (anti-duplicação e transições de estado)
    5. Guarda dados e aciona notificações se existirem novidades
    """
    print("\n" + "=" * 65)
    print("GrevesPT • A iniciar ciclo de monitorização e ingestão...")
    print("=" * 65)

    # 1. Carrega greves existentes
    existentes = load_existing_strikes()
    print(f"[Estado Inicial] {len(existentes)} greves carregadas do ficheiro.")

    # 2. Limpeza automática de greves expiradas
    ativas, arquivadas_count = archive_outdated_strikes(existentes)

    # Mapa para verificação rápida de duplicados por chave (empresa_normalizada + data_inicio)
    mapa_ativas: Dict[str, Dict[str, Any]] = {}
    for item in ativas:
        empresa_norm = re.sub(r'[^a-zA-Z0-9]', '', (item.get("empresa") or "").lower())
        data_ini = (item.get("dataInicio") or item.get("data_inicio") or "")[:10]
        chave = f"{empresa_norm}_{data_ini}"
        mapa_ativas[chave] = item

    # 3. Coleta de artigos
    artigos = fetch_google_news_rss()
    dgaep_avisos = fetch_dgaep_avisos()
    todos_artigos = artigos + dgaep_avisos

    novas_greves: List[Dict[str, Any]] = []
    greves_atualizadas: List[Dict[str, Any]] = []

    # Verificação do extrator de IA
    api_key_disponivel = bool(os.environ.get("GEMINI_API_KEY"))
    if not api_key_disponivel or extract_strike_data is None:
        print("[Alerta] GEMINI_API_KEY não configurada ou ai_parser indisponível. A executar em modo verificação.")
    else:
        print("[IA Parser] Gemini 2.5 Flash pronto para análise de comunicados.")

        # Processar artigos recolhidos
        for art in todos_artigos[:6]:  # Limita batches para controlo de quota
            texto_artigo = f"{art['titulo']}\n\n{art['resumo']}"

            # Tenta texto completo se o resumo for muito curto
            if len(art['resumo']) < 150:
                full_text = fetch_article_full_text(art['link'])
                if full_text:
                    texto_artigo += f"\n\n{full_text}"

            try:
                # Chama o Gemini 2.5 Flash via ai_parser
                resultado_schema = extract_strike_data(
                    raw_text=texto_artigo,
                    fonte_url=art['link']
                )

                if isinstance(resultado_schema, list):
                    lista_resultados = resultado_schema
                else:
                    lista_resultados = [resultado_schema]

                for strike_schema in lista_resultados:
                    novo_pwa_item = convert_schema_to_pwa_item(strike_schema, art)
                    
                    empresa_norm = re.sub(r'[^a-zA-Z0-9]', '', novo_pwa_item["empresa"].lower())
                    data_ini = novo_pwa_item["dataInicio"][:10]
                    chave = f"{empresa_norm}_{data_ini}"

                    if chave in mapa_ativas:
                        item_existente = mapa_ativas[chave]
                        # Verifica se houve mudança relevante de estado ou serviços mínimos
                        estado_antigo = item_existente.get("estado")
                        estado_novo = novo_pwa_item.get("estado")
                        
                        mudou_estado = estado_antigo != estado_novo
                        mudou_servicos = (
                            novo_pwa_item.get("servicosMinimos") and 
                            novo_pwa_item["servicosMinimos"] != item_existente.get("servicosMinimos")
                        )

                        if mudou_estado or mudou_servicos:
                            print(f"[Atualização] {novo_pwa_item['empresa']}: Estado '{estado_antigo}' -> '{estado_novo}'")
                            item_existente.update(novo_pwa_item)
                            greves_atualizadas.append(item_existente)
                    else:
                        print(f"[Nova Greve Detetada] {novo_pwa_item['empresa']} em {data_ini} ({novo_pwa_item['estado']})")
                        mapa_ativas[chave] = novo_pwa_item
                        novas_greves.append(novo_pwa_item)

            except Exception as e:
                # Resiliência: o scraper não para se um artigo falhar
                print(f"[Aviso Parser] Ignorando artigo devido a erro: {e}")

    # Lista final consolidada
    lista_final = list(mapa_ativas.values())

    # 4. Salvar alterações no greves.json
    if novas_greves or greves_atualizadas or arquivadas_count > 0:
        save_strikes(lista_final)
    else:
        print("[Scraper] Nenhuma alteração detetada no estado das greves.")

    # 5. Notificar canais (Web Push + Telegram) caso haja novidades
    alteracoes_para_notificar = novas_greves + greves_atualizadas
    if alteracoes_para_notificar and notify_all_channels is not None:
        print(f"[Notificações] A disparar alertas para {len(alteracoes_para_notificar)} evento(s)...")
        for item in alteracoes_para_notificar:
            try:
                notify_all_channels(item)
            except Exception as err:
                print(f"[Erro Notifier]: {err}", file=sys.stderr)

    resumo = {
        "totalAtivas": len(lista_final),
        "novas": len(novas_greves),
        "atualizadas": len(greves_atualizadas),
        "arquivadas": arquivadas_count,
        "timestamp": datetime.now().isoformat()
    }

    print("\n" + "=" * 65)
    print(f"Resumo do Ciclo: {resumo['novas']} novas | {resumo['atualizadas']} atualizadas | {resumo['arquivadas']} arquivadas.")
    print("=" * 65 + "\n")

    return resumo


if __name__ == "__main__":
    run_scraper_pipeline()
