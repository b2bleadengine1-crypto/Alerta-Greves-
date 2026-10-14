#!/usr/bin/env python3
"""
GrevesPT - Sistema de Notificações Multi-Canal (Telegram Bot + OneSignal Web Push Broadcast)
Módulo: notifier.py
Tecnologias: Python 3, Telegram Bot API, OneSignal REST API, ntfy.sh (fallback)

Canais Ativos:
1. Canal / Grupo de Telegram (Bot API com botões inline interativos e link manual de partilha WhatsApp)
2. OneSignal Web Push Broadcast (Disparo em massa para dispositivos com PWA instalada)
3. ntfy.sh (Canal de redundância broadcast livre)

Chaves de Configuração (5 Chaves):
- GEMINI_API_KEY         (usado no ai_parser.py e scraper_greves.py)
- TELEGRAM_BOT_TOKEN     (Token do BotFather)
- TELEGRAM_CHAT_ID       (ID do canal ou grupo de destino no Telegram)
- ONESIGNAL_APP_ID       (Identificador da aplicação OneSignal para Web Push)
- ONESIGNAL_REST_API_KEY (Chave de autenticação REST da API OneSignal)
"""

import os
import sys
import json
import re
import urllib.parse
import urllib.request
import urllib.error
import unicodedata
from typing import Dict, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

HTTP_TIMEOUT = 12


def slugify(text: str) -> str:
    """Normaliza texto em slug seguro para tags e tópicos (ex: 'Educação' -> 'educacao')."""
    if not text:
        return "geral"
    text = unicodedata.normalize('NFD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    return re.sub(r'[^a-zA-Z0-9]+', '_', text).strip('_').lower()


def format_date_br(iso_str: str) -> str:
    """Formata data ISO YYYY-MM-DD para formato legível em português."""
    if not iso_str:
        return "A confirmar"
    data_limpa = iso_str.split("T")[0]
    meses = {
        "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
        "05": "maio", "06": "junho", "07": "julho", "08": "agosto",
        "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro"
    }
    partes = data_limpa.split("-")
    if len(partes) == 3:
        ano, mes, dia = partes
        return f"{dia} de {meses.get(mes, mes)} de {ano}"
    return data_limpa


def http_post_payload(
    url: str,
    json_data: Optional[Dict[str, Any]] = None,
    raw_data: Optional[bytes] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = HTTP_TIMEOUT
) -> Tuple[int, str]:
    """Executa um POST HTTP resiliente utilizando requests ou urllib nativo como fallback."""
    hdrs = dict(headers or {})
    if requests is not None:
        if json_data is not None:
            r = requests.post(url, json=json_data, headers=hdrs, timeout=timeout)
        else:
            r = requests.post(url, data=raw_data, headers=hdrs, timeout=timeout)
        return r.status_code, r.text
    else:
        body = b""
        if json_data is not None:
            body = json.dumps(json_data).encode("utf-8")
            if "Content-Type" not in hdrs:
                hdrs["Content-Type"] = "application/json"
        elif raw_data is not None:
            body = raw_data

        req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception as e:
            raise e


# ==============================================================================
# 1. CANAL / GRUPO DE TELEGRAM (Bot API Oficial com Botões Inline)
# ==============================================================================

def enviar_telegram(greve: Dict[str, Any]) -> bool:
    """
    Envia uma notificação formatada em HTML para um Canal ou Grupo de Telegram.
    Endpoint: POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage
    Inclui botões inline interativos: link da fonte oficial e botão manual de partilha WhatsApp (https://wa.me/?text=...).
    """
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if not bot_token or not chat_id:
        print("[Telegram Info] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos. Disparo ignorado.")
        return False

    empresa = greve.get("empresa") or greve.get("empresa_ou_entidade", "Operador de Transportes")
    setor = greve.get("setor", "Transportes")
    regiao = greve.get("regiao", "Nacional")
    estado = greve.get("estado", "Confirmada")
    horario = greve.get("horario") or greve.get("horario_afetado", "24 Horas")
    servicos = greve.get("servicosMinimos") or greve.get("servicos_minimos", "Sem serviços mínimos fixados.")
    fonte = greve.get("fonteOficial") or greve.get("fonte_url", "https://dados.gov.pt")

    data_inicio_raw = (greve.get("dataInicio") or greve.get("data_inicio", ""))[:10]
    data_fim_raw = (greve.get("dataFim") or greve.get("data_fim", ""))[:10]
    periodo = data_inicio_raw if data_inicio_raw == data_fim_raw or not data_fim_raw else f"{data_inicio_raw} a {data_fim_raw}"

    status_emoji = "🔴" if "Confirmada" in estado else ("⚖️" if "Mínimos" in estado else "⚠️")

    # Formatação em HTML limpo para o Telegram
    mensagem_html = (
        f"{status_emoji} <b>ALERTA GREVES PT: {empresa}</b> {status_emoji}\n\n"
        f"📍 <b>Região:</b> {regiao}\n"
        f"🏷️ <b>Setor:</b> {setor}\n"
        f"📅 <b>Data:</b> {periodo}\n"
        f"⏰ <b>Horário:</b> {horario}\n"
        f"🚨 <b>Estado:</b> <code>{estado}</code>\n\n"
        f"⚖️ <b>Serviços Mínimos Decretados:</b>\n<i>{servicos}</i>\n\n"
        f"📢 <i>Acompanha todas as paralisações em tempo real no GrevesPT.</i>"
    )

    # Botão manual de partilha por link WhatsApp nativo (https://wa.me/?text=...)
    share_wa_text = f"⚠️ *Alerta GrevesPT*: Greve convocada em {empresa} para {periodo} ({horario}). Serviços Mínimos: {servicos[:140]}"
    encoded_share_wa = urllib.parse.quote(share_wa_text)
    wa_share_url = f"https://wa.me/?text={encoded_share_wa}"

    # Botões inline interativos (Inline Keyboard)
    reply_markup = {
        "inline_keyboard": [
            [
                {"text": "🔗 Fonte Oficial", "url": fonte},
                {"text": "💬 Partilhar WhatsApp", "url": wa_share_url}
            ],
            [
                {"text": "📱 Abrir PWA GrevesPT", "url": "https://dados.gov.pt"}
            ]
        ]
    }

    url_telegram = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": mensagem_html,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": reply_markup
    }

    try:
        status_code, resp_text = http_post_payload(url_telegram, json_data=payload, timeout=HTTP_TIMEOUT)
        if status_code == 200:
            print(f"[Telegram] Alerta enviado com sucesso para o canal {chat_id}.")
            return True
        else:
            print(f"[Telegram Erro] Resposta {status_code}: {resp_text}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[Telegram Exceção] Falha ao enviar para Telegram: {e}", file=sys.stderr)
        return False


# ==============================================================================
# 2. WEB PUSH BROADCAST PARA A PWA (OneSignal REST API + ntfy.sh Redundância)
# ==============================================================================

def enviar_webpush_broadcast(greve: Dict[str, Any]) -> bool:
    """
    Dispara o alerta Web Push em broadcast para os utilizadores da PWA:
    - OneSignal REST API (com ONESIGNAL_APP_ID e ONESIGNAL_REST_API_KEY)
    - ntfy.sh (canal público gratuito para redundância instantânea sem backend)
    """
    empresa = greve.get("empresa") or greve.get("empresa_ou_entidade", "Greve")
    setor = greve.get("setor", "Transportes")
    estado = greve.get("estado", "Aviso de Greve")
    data_inicio = (greve.get("dataInicio") or greve.get("data_inicio", ""))[:10]
    servicos = greve.get("servicosMinimos") or greve.get("servicos_minimos", "")
    fonte = greve.get("fonteOficial") or greve.get("fonte_url", "https://dados.gov.pt")

    setor_slug = slugify(setor)
    onesignal_sucesso = False
    ntfy_sucesso = False

    # 1. OneSignal Broadcast Oficial via REST API
    app_id = os.getenv("ONESIGNAL_APP_ID", "").strip()
    rest_key = os.getenv("ONESIGNAL_REST_API_KEY", "").strip()

    if app_id and rest_key:
        os_payload = {
            "app_id": app_id,
            "filters": [
                {"field": "tag", "key": f"setor_{setor_slug}", "relation": "=", "value": "true"},
                {"operator": "OR"},
                {"field": "tag", "key": "setor_todos", "relation": "=", "value": "true"}
            ],
            "headings": {
                "pt": f"GrevesPT • {empresa}",
                "en": f"GrevesPT • {empresa}"
            },
            "contents": {
                "pt": f"{estado} ({data_inicio}): {servicos[:110]}...",
                "en": f"{estado} ({data_inicio})"
            },
            "url": fonte,
            "priority": 10
        }
        try:
            status_code, resp_text = http_post_payload(
                "https://onesignal.com/api/v1/notifications",
                json_data=os_payload,
                headers={"Authorization": f"Basic {rest_key}"},
                timeout=HTTP_TIMEOUT
            )
            if status_code in (200, 202):
                onesignal_sucesso = True
                print(f"[OneSignal] Web Push broadcast enviado com sucesso para tag '{setor_slug}' e 'todos'.")
            else:
                print(f"[OneSignal Erro {status_code}]: {resp_text}", file=sys.stderr)
        except Exception as e:
            print(f"[OneSignal Exceção]: {e}", file=sys.stderr)
    else:
        print("[OneSignal Info] ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY ausentes. Disparo OneSignal ignorado.")

    # 2. ntfy.sh Redundância Pública
    prefix = os.getenv("NTFY_TOPIC_PREFIX", "grevespt")
    titulo_ntfy = f"🚨 {empresa} ({estado})"
    mensagem_ntfy = f"Setor: {setor} | Início: {data_inicio}\nServiços Mínimos: {servicos or 'Sem serviços mínimos previstos'}"

    headers_ntfy = {
        "Title": titulo_ntfy,
        "Priority": "urgent" if "alta" in str(greve.get("gravidade", "")).lower() else "high",
        "Tags": "warning,train" if "transporte" in setor_slug else "warning,loudspeaker",
        "Click": fonte
    }

    for topic in [f"{prefix}_{setor_slug}", f"{prefix}_geral"]:
        try:
            status_code, _ = http_post_payload(
                f"https://ntfy.sh/{topic}",
                raw_data=mensagem_ntfy.encode("utf-8"),
                headers=headers_ntfy,
                timeout=HTTP_TIMEOUT
            )
            if status_code == 200:
                ntfy_sucesso = True
        except Exception as e:
            print(f"[ntfy.sh Erro em {topic}]: {e}", file=sys.stderr)

    if ntfy_sucesso:
        print(f"[ntfy.sh] Broadcast de redundância enviado em 'ntfy.sh/{prefix}_{setor_slug}'.")

    return onesignal_sucesso or ntfy_sucesso


# ==============================================================================
# 3. DISPATCHER UNIFICADO COM TRATAMENTO DE ERROS INDEPENDENTE
# ==============================================================================

def notify_all_channels(strike_item: Dict[str, Any]) -> Dict[str, bool]:
    """
    Dispara simultaneamente para o Telegram e Web Push (OneSignal) com blocos try/except independentes.
    Se um canal falhar ou estiver com credencial ausente, o outro continua normalmente.
    """
    empresa = strike_item.get("empresa") or strike_item.get("empresa_ou_entidade", "Greve")
    print(f"\n[Broadcast] A iniciar envio de alertas para: {empresa}...")

    resultados = {
        "telegram": False,
        "webpush": False
    }

    # 1. Telegram Bot com Botões Inline
    try:
        resultados["telegram"] = enviar_telegram(strike_item)
    except Exception as e:
        print(f"[Erro Isolado Telegram]: {e}", file=sys.stderr)

    # 2. OneSignal Web Push Broadcast (+ ntfy.sh)
    try:
        resultados["webpush"] = enviar_webpush_broadcast(strike_item)
    except Exception as e:
        print(f"[Erro Isolado WebPush]: {e}", file=sys.stderr)

    print(f"[Resumo de Disparos] Telegram: {'OK' if resultados['telegram'] else 'Off/Erro'} | "
          f"WebPush: {'OK' if resultados['webpush'] else 'Off/Erro'}")

    return resultados


# ==============================================================================
# 4. VERIFICAÇÃO DE CONFIGURAÇÃO E CLI DE TESTE
# ==============================================================================

def check_keys_status() -> None:
    """Verifica quais das 5 chaves essenciais estão configuradas no ambiente."""
    chaves = {
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "TELEGRAM_BOT_TOKEN": bool(os.getenv("TELEGRAM_BOT_TOKEN")),
        "TELEGRAM_CHAT_ID": bool(os.getenv("TELEGRAM_CHAT_ID")),
        "ONESIGNAL_APP_ID": bool(os.getenv("ONESIGNAL_APP_ID")),
        "ONESIGNAL_REST_API_KEY": bool(os.getenv("ONESIGNAL_REST_API_KEY")),
    }

    print("\n" + "=" * 60)
    print("GrevesPT • Estado das 5 Chaves de Configuração")
    print("=" * 60)
    for chave, definida in chaves.items():
        simbolo = "✅ Configurada" if definida else "⚠️ Ausente"
        print(f"  • {chave:24}: {simbolo}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    sample_strike = {
        "empresa": "CP - Comboios de Portugal",
        "setor": "Transportes",
        "regiao": "Nacional",
        "estado": "Confirmada",
        "gravidade": "alta",
        "dataInicio": "2026-10-24T00:00:00",
        "dataFim": "2026-10-24T23:59:59",
        "horario": "00h00 às 24h00 (24 Horas)",
        "servicosMinimos": "O Tribunal Arbitral do CES decretou serviços mínimos de 25% para comboios Urbanos de Lisboa e Porto, Regionais e Longo Curso.",
        "impacto": "Supressão em massa de comboios com fortes perturbações nas ligações metropolitanas de Lisboa e Porto.",
        "fonteOficial": "https://www.cp.pt/passageiros/pt/consultar-horarios/avisos/greve"
    }

    if "--status" in sys.argv or "--check" in sys.argv:
        check_keys_status()
    elif "--test-telegram" in sys.argv:
        print("[Teste] A testar envio exclusivo para o Telegram...")
        ok = enviar_telegram(sample_strike)
        print(f"Resultado Telegram: {'Sucesso' if ok else 'Falha'}")
    elif "--test-webpush" in sys.argv:
        print("[Teste] A testar envio exclusivo para Web Push (OneSignal)...")
        ok = enviar_webpush_broadcast(sample_strike)
        print(f"Resultado Web Push: {'Sucesso' if ok else 'Falha'}")
    else:
        print("=" * 70)
        print("GrevesPT • Teste Multi-Canal (Telegram Bot + OneSignal Web Push)")
        print("Comandos disponíveis:")
        print("  python notifier.py --status         # Verifica estado das 5 chaves")
        print("  python notifier.py --test-telegram  # Testa envio para o Telegram")
        print("  python notifier.py --test-webpush   # Testa disparo OneSignal Web Push")
        print("=" * 70)

        check_keys_status()
        res = notify_all_channels(sample_strike)
        print("\nResultado detalhado:", json.dumps(res, indent=2))
