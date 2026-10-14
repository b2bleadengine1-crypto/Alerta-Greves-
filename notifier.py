#!/usr/bin/env python3
"""
GrevesPT - Notificador Oficial Multi-Canal (OneSignal REST API + Telegram Bot)
Módulo: notifier.py
Tecnologias: Python 3, Telegram Bot API (@alertagrevespt_bot), OneSignal REST API v1

Canais Oficiais de Produção:
1. OneSignal Web Push:
   - Endpoint: https://api.onesignal.com/notifications
   - Header: Authorization: Key {ONESIGNAL_REST_API_KEY}
   - Segmento: ["Total Subscriptions"]
2. Telegram Bot API:
   - Bot Oficial: @alertagrevespt_bot
   - Endpoint: https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage
   - Botões Inline: Fonte Oficial, 📲 Partilhar no WhatsApp (https://wa.me/?text=...) e Bot Telegram

Variáveis de Ambiente Necessárias:
- GEMINI_API_KEY
- ONESIGNAL_APP_ID
- ONESIGNAL_REST_API_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
"""

import os
import sys
import json
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

HTTP_TIMEOUT = 15


def http_post_payload(
    url: str,
    json_data: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = HTTP_TIMEOUT
) -> Tuple[int, str]:
    """Executa um POST HTTP resiliente utilizando requests ou urllib como fallback."""
    hdrs = dict(headers or {})
    if "Content-Type" not in hdrs:
        hdrs["Content-Type"] = "application/json"

    if requests is not None:
        r = requests.post(url, json=json_data, headers=hdrs, timeout=timeout)
        return r.status_code, r.text
    else:
        body = json.dumps(json_data or {}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", errors="replace")
        except Exception as e:
            raise e


# ==============================================================================
# 1. ONESIGNAL REST API (Web Push Broadcast para Total Subscriptions)
# ==============================================================================

def enviar_onesignal_push(greve: Dict[str, Any]) -> bool:
    """
    Envia notificação Web Push usando a API REST oficial da OneSignal.
    - URL: https://api.onesignal.com/notifications
    - Segmento: ["Total Subscriptions"]
    - Header: Authorization: Key {ONESIGNAL_REST_API_KEY}
    """
    app_id = os.getenv("ONESIGNAL_APP_ID", "").strip()
    rest_key = os.getenv("ONESIGNAL_REST_API_KEY", "").strip()

    if not app_id or not rest_key:
        print("[OneSignal Info] ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY ausentes. Disparo ignorado.")
        return False

    empresa = greve.get("empresa") or greve.get("empresa_ou_entidade", "Transportes")
    setor = greve.get("setor", "Transportes")
    estado = greve.get("estado", "Aviso de Greve")
    data_inicio = (greve.get("dataInicio") or greve.get("data_inicio", ""))[:10]
    data_fim = (greve.get("dataFim") or greve.get("data_fim", ""))[:10]
    periodo = data_inicio if data_inicio == data_fim or not data_fim else f"{data_inicio} a {data_fim}"
    servicos = greve.get("servicosMinimos") or greve.get("servicos_minimos", "Sem serviços mínimos definidos.")
    fonte = greve.get("fonteOficial") or greve.get("fonte_url", "https://dados.gov.pt")

    # Resumo para o corpo da notificação (até 140 chars)
    corpo = f"{estado} ({periodo}): {servicos[:110]}"
    if len(servicos) > 110:
        corpo += "..."

    payload = {
        "app_id": app_id,
        "included_segments": ["Total Subscriptions"],
        "headings": {
            "pt": f"GrevesPT • {empresa}",
            "en": f"GrevesPT • {empresa}"
        },
        "contents": {
            "pt": corpo,
            "en": corpo
        },
        "url": fonte,
        "priority": 10
    }

    headers = {
        "Authorization": f"Key {rest_key}",
        "Content-Type": "application/json"
    }

    try:
        status_code, resp_text = http_post_payload(
            "https://api.onesignal.com/notifications",
            json_data=payload,
            headers=headers,
            timeout=HTTP_TIMEOUT
        )
        if status_code in (200, 202):
            print(f"[OneSignal] Web Push enviado com sucesso para 'Total Subscriptions': {empresa}")
            return True
        else:
            print(f"[OneSignal Erro {status_code}]: {resp_text}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[OneSignal Exceção]: Falha ao contactar OneSignal REST API: {e}", file=sys.stderr)
        return False


# ==============================================================================
# 2. TELEGRAM BOT API (@alertagrevespt_bot)
# ==============================================================================

def enviar_telegram(greve: Dict[str, Any]) -> bool:
    """
    Envia uma notificação formatada para o canal/grupo do Telegram usando o Bot @alertagrevespt_bot.
    Inclui botões inline:
    - 🔗 Fonte Oficial
    - 📲 Partilhar no WhatsApp (link https://wa.me/?text=...)
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
    motivo = greve.get("motivo", "Reivindicações laborais")
    fonte = greve.get("fonteOficial") or greve.get("fonte_url", "https://dados.gov.pt")

    data_inicio_raw = (greve.get("dataInicio") or greve.get("data_inicio", ""))[:10]
    data_fim_raw = (greve.get("dataFim") or greve.get("data_fim", ""))[:10]
    periodo = data_inicio_raw if data_inicio_raw == data_fim_raw or not data_fim_raw else f"{data_inicio_raw} a {data_fim_raw}"

    status_emoji = "🔴" if "Confirmada" in estado else ("⚖️" if "Mínimos" in estado else "⚠️")

    # Formatação limpa em HTML
    mensagem_html = (
        f"{status_emoji} <b>ALERTA GREVES PT: {empresa}</b> {status_emoji}\n\n"
        f"📍 <b>Região:</b> {regiao}\n"
        f"🏷️ <b>Setor:</b> {setor}\n"
        f"📅 <b>Data:</b> {periodo}\n"
        f"⏰ <b>Horário:</b> {horario}\n"
        f"🚨 <b>Estado:</b> <code>{estado}</code>\n\n"
        f"⚖️ <b>Serviços Mínimos Decretados:</b>\n<i>{servicos}</i>\n\n"
        f"📌 <b>Motivo:</b> {motivo}\n\n"
        f"📢 <i>Acompanha todas as paralisações em tempo real no bot @alertagrevespt_bot.</i>"
    )

    # Texto formatado para o botão direto "📲 Partilhar no WhatsApp" (https://wa.me/?text=...)
    share_wa_text = (
        f"⚠️ *Alerta GrevesPT*: Greve em {empresa} ({setor})\n"
        f"📅 Data: {periodo}\n"
        f"⏰ Horário: {horario}\n"
        f"⚖️ Serviços Mínimos: {servicos}\n"
        f"ℹ️ Alertas ao vivo: https://t.me/alertagrevespt_bot"
    )
    encoded_share_wa = urllib.parse.quote(share_wa_text)
    wa_share_url = f"https://wa.me/?text={encoded_share_wa}"

    reply_markup = {
        "inline_keyboard": [
            [
                {"text": "🔗 Fonte Oficial", "url": fonte},
                {"text": "📲 Partilhar no WhatsApp", "url": wa_share_url}
            ],
            [
                {"text": "✈️ Abrir @alertagrevespt_bot", "url": "https://t.me/alertagrevespt_bot"}
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
            print(f"[Telegram] Alerta enviado com sucesso para {chat_id}.")
            return True
        else:
            print(f"[Telegram Erro {status_code}]: {resp_text}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[Telegram Exceção]: Falha ao contactar Telegram Bot API: {e}", file=sys.stderr)
        return False


# ==============================================================================
# 3. DISPATCHER UNIFICADO (Apenas OneSignal + Telegram)
# ==============================================================================

def notify_all_channels(strike_item: Dict[str, Any]) -> Dict[str, bool]:
    """
    Dispara simultaneamente para os 2 canais oficiais (OneSignal + Telegram Bot).
    Tratamento independente: uma falha num canal não afeta o outro.
    """
    empresa = strike_item.get("empresa") or strike_item.get("empresa_ou_entidade", "Greve")
    print(f"\n[Broadcast Produção] Disparo para OneSignal e Telegram: {empresa}...")

    resultados = {
        "onesignal": False,
        "telegram": False
    }

    # 1. OneSignal REST API (Total Subscriptions)
    try:
        resultados["onesignal"] = enviar_onesignal_push(strike_item)
    except Exception as e:
        print(f"[Erro Isolado OneSignal]: {e}", file=sys.stderr)

    # 2. Telegram Bot (@alertagrevespt_bot)
    try:
        resultados["telegram"] = enviar_telegram(strike_item)
    except Exception as e:
        print(f"[Erro Isolado Telegram]: {e}", file=sys.stderr)

    print(f"[Resumo] OneSignal: {'OK' if resultados['onesignal'] else 'Off/Erro'} | "
          f"Telegram: {'OK' if resultados['telegram'] else 'Off/Erro'}")

    return resultados


def check_keys_status() -> None:
    """Verifica quais das 5 chaves de produção estão configuradas no ambiente."""
    chaves = {
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "ONESIGNAL_APP_ID": bool(os.getenv("ONESIGNAL_APP_ID")),
        "ONESIGNAL_REST_API_KEY": bool(os.getenv("ONESIGNAL_REST_API_KEY")),
        "TELEGRAM_BOT_TOKEN": bool(os.getenv("TELEGRAM_BOT_TOKEN")),
        "TELEGRAM_CHAT_ID": bool(os.getenv("TELEGRAM_CHAT_ID")),
    }

    print("\n" + "=" * 60)
    print("GrevesPT • Estado das 5 Chaves de Produção")
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
        "motivo": "Revisão da tabela salarial e cumprimento do Acordo de Empresa",
        "servicosMinimos": "O Tribunal Arbitral do CES decretou serviços mínimos de 25% para comboios Urbanos, Regionais e Longo Curso.",
        "fonteOficial": "https://www.cp.pt/passageiros/pt/consultar-horarios/avisos/greve"
    }

    if "--status" in sys.argv:
        check_keys_status()
    elif "--test-onesignal" in sys.argv:
        ok = enviar_onesignal_push(sample_strike)
        print(f"Resultado OneSignal: {'Sucesso' if ok else 'Falha'}")
    elif "--test-telegram" in sys.argv:
        ok = enviar_telegram(sample_strike)
        print(f"Resultado Telegram: {'Sucesso' if ok else 'Falha'}")
    else:
        check_keys_status()
        res = notify_all_channels(sample_strike)
        print("\nResultado:", json.dumps(res, indent=2))
