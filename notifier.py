#!/usr/bin/env python3
"""
GrevesPT - Official Multi-Channel Alert Notifier
File: notifier.py
Language: Clean English Implementation

Environment Variables:
- TELEGRAM_BOT_TOKEN: Bot token issued by BotFather
- TELEGRAM_CHAT_ID: Target channel or group chat ID (defaults to "@alertagreves_pt")
- ONESIGNAL_APP_ID: OneSignal Application ID
- ONESIGNAL_REST_API_KEY: OneSignal REST API Key
- GEMINI_API_KEY: Gemini API Key (optional here, used in ai_parser.py)

Destinations:
1. Telegram Bot API:
   - Endpoint: https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
   - Format: Formatted Markdown with strike details & inline action buttons
2. OneSignal REST API:
   - Endpoint: https://api.onesignal.com/notifications
   - Segment: ["Total Subscriptions"]

Usage:
  python notifier.py                 # Reads greves.json and sends alerts unconditionally
  python notifier.py --status        # Checks status of the 5 environment keys
  python notifier.py --test-telegram # Sends test strike alert to Telegram
  python notifier.py --test-onesignal# Sends test strike alert to OneSignal
"""

import os
import sys
import json
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

HTTP_TIMEOUT = 15
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "greves.json")
PUBLIC_DATA_FILE = os.path.join(BASE_DIR, "public", "greves.json")


# ==============================================================================
# HTTP HELPER WITH COMPREHENSIVE LOGGING
# ==============================================================================

def execute_http_post(
    url: str,
    json_payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = HTTP_TIMEOUT
) -> Tuple[int, str]:
    """
    Executes an HTTP POST request using `requests` (if available) or `urllib`.
    Provides detailed error inspection and response retrieval.
    """
    request_headers = dict(headers or {})
    if "Content-Type" not in request_headers:
        request_headers["Content-Type"] = "application/json"

    if requests is not None:
        try:
            response = requests.post(url, json=json_payload, headers=request_headers, timeout=timeout)
            return response.status_code, response.text
        except requests.exceptions.RequestException as req_err:
            raise RuntimeError(f"Network error during requests.post: {req_err}") from req_err
    else:
        body_bytes = json.dumps(json_payload or {}).encode("utf-8")
        req = urllib.request.Request(url, data=body_bytes, headers=request_headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                status = response.status
                body = response.read().decode("utf-8", errors="replace")
                return status, body
        except urllib.error.HTTPError as http_err:
            err_body = http_err.read().decode("utf-8", errors="replace")
            return http_err.code, err_body
        except urllib.error.URLError as url_err:
            raise RuntimeError(f"Network error during urllib.request: {url_err}") from url_err
        except Exception as general_err:
            raise RuntimeError(f"Unexpected error during HTTP POST: {general_err}") from general_err


# ==============================================================================
# 1. TELEGRAM BOT NOTIFICATIONS
# ==============================================================================

def send_telegram_alert(strike: Dict[str, Any]) -> bool:
    """
    Sends a formatted Markdown alert message to the Telegram channel or group.
    Target: TELEGRAM_CHAT_ID environment variable (defaults to '@alertagreves_pt').
    Includes comprehensive try-except logging for debugging HTTP responses.
    """
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip() or "@alertagreves_pt"

    if not bot_token:
        print("[Telegram Notice] TELEGRAM_BOT_TOKEN is not set. Skipping Telegram notification.")
        return False

    empresa = strike.get("empresa") or strike.get("empresa_ou_entidade", "Operador de Transportes")
    setor = strike.get("setor", "Transportes")
    regiao = strike.get("regiao", "Nacional")
    estado = strike.get("estado", "Confirmada")
    gravidade = strike.get("gravidadeText") or strike.get("gravidade", "High Severity / Alta Gravidade")
    horario = strike.get("horario") or strike.get("horario_afetado", "24 Horas")
    servicos = strike.get("servicosMinimos") or strike.get("servicos_minimos", "Sem serviços mínimos definidos.")
    motivo = strike.get("motivo", "Reivindicações laborais")
    fonte = strike.get("fonteOficial") or strike.get("fonte_url", "https://dados.gov.pt")

    data_ini = (strike.get("dataInicio") or strike.get("data_inicio", ""))[:10]
    data_fim = (strike.get("dataFim") or strike.get("data_fim", ""))[:10]
    periodo = data_ini if data_ini == data_fim or not data_fim else f"{data_ini} a {data_fim}"

    # Formatted Markdown text
    markdown_message = (
        f"🚨 *ALERTA GREVES PT: {empresa}* 🚨\n\n"
        f"📍 *Região:* {regiao}\n"
        f"🏷️ *Setor:* {setor}\n"
        f"📅 *Data:* {periodo}\n"
        f"⏰ *Horário:* {horario}\n"
        f"🚨 *Estado:* `{estado}`\n"
        f"⚠️ *Gravidade:* {gravidade}\n\n"
        f"⚖️ *Serviços Mínimos Decretados:*\n_{servicos}_\n\n"
        f"📌 *Motivo:* {motivo}\n\n"
        f"📢 _Acompanha todas as paralisações em tempo real no canal @alertagreves_pt_"
    )

    # WhatsApp share direct link
    share_wa_text = (
        f"⚠️ *Alerta GrevesPT*: Greve em {empresa} ({setor})\n"
        f"📅 Data: {periodo}\n"
        f"⏰ Horário: {horario}\n"
        f"⚖️ Serviços Mínimos: {servicos}\n"
        f"ℹ️ Alertas ao vivo: https://t.me/alertagreves_pt"
    )
    encoded_share_wa = urllib.parse.quote(share_wa_text)
    wa_share_url = f"https://wa.me/?text={encoded_share_wa}"

    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "🔗 Fonte Oficial", "url": fonte},
                {"text": "📲 Partilhar no WhatsApp", "url": wa_share_url}
            ],
            [
                {"text": "✈️ Abrir @alertagreves_pt", "url": "https://t.me/alertagreves_pt"}
            ]
        ]
    }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": markdown_message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
        "reply_markup": inline_keyboard
    }

    print(f"\n[Telegram Request] Sending alert for '{empresa}' to {chat_id}...")
    print(f"  -> POST URL: https://api.telegram.org/bot{'*' * 8}/sendMessage")

    try:
        status_code, response_body = execute_http_post(url, json_payload=payload, timeout=HTTP_TIMEOUT)
        
        # Parse JSON response for detailed logging
        try:
            parsed_json = json.loads(response_body)
            is_ok = parsed_json.get("ok", False)
        except Exception:
            parsed_json = None
            is_ok = (status_code == 200)

        if status_code == 200 and is_ok:
            message_id = parsed_json.get("result", {}).get("message_id") if parsed_json else "N/A"
            print(f"[Telegram Success] HTTP {status_code}: Message delivered successfully! (Message ID: {message_id})")
            return True
        else:
            print(f"[Telegram HTTP Error] Status Code: {status_code}", file=sys.stderr)
            print(f"[Telegram Error Body]: {response_body}", file=sys.stderr)
            if parsed_json:
                print(f"[Telegram Error Details]: {parsed_json.get('description')}", file=sys.stderr)
            return False

    except Exception as exc:
        print(f"[Telegram Exception] Request failed with exception: {exc}", file=sys.stderr)
        return False


# ==============================================================================
# 2. ONESIGNAL REST API NOTIFICATIONS
# ==============================================================================

def send_onesignal_alert(strike: Dict[str, Any]) -> bool:
    """
    Sends a Web Push notification broadcast using the OneSignal REST API.
    Reads ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY from environment variables.
    Includes comprehensive try-except logging for debugging HTTP responses.
    """
    app_id = os.getenv("ONESIGNAL_APP_ID", "").strip()
    rest_key = os.getenv("ONESIGNAL_REST_API_KEY", "").strip()

    if not app_id or not rest_key:
        print("[OneSignal Notice] ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not configured. Skipping OneSignal push.")
        return False

    empresa = strike.get("empresa") or strike.get("empresa_ou_entidade", "GrevesPT")
    estado = strike.get("estado", "Aviso de Greve")
    data_ini = (strike.get("dataInicio") or strike.get("data_inicio", ""))[:10]
    data_fim = (strike.get("dataFim") or strike.get("data_fim", ""))[:10]
    periodo = data_ini if data_ini == data_fim or not data_fim else f"{data_ini} a {data_fim}"
    servicos = strike.get("servicosMinimos") or strike.get("servicos_minimos", "Sem serviços mínimos definidos.")
    fonte = strike.get("fonteOficial") or strike.get("fonte_url", "https://dados.gov.pt")

    body_text = f"{estado} ({periodo}): {servicos[:110]}"
    if len(servicos) > 110:
        body_text += "..."

    payload = {
        "app_id": app_id,
        "included_segments": ["Total Subscriptions"],
        "headings": {
            "pt": f"GrevesPT • {empresa}",
            "en": f"GrevesPT • {empresa}"
        },
        "contents": {
            "pt": body_text,
            "en": body_text
        },
        "url": fonte,
        "priority": 10
    }

    headers = {
        "Authorization": f"Key {rest_key}",
        "Content-Type": "application/json"
    }

    url = "https://api.onesignal.com/notifications"
    print(f"\n[OneSignal Request] Sending Web Push broadcast for '{empresa}'...")
    print(f"  -> POST URL: {url} | Segment: Total Subscriptions | App ID: {app_id}")

    try:
        status_code, response_body = execute_http_post(url, json_payload=payload, headers=headers, timeout=HTTP_TIMEOUT)

        if status_code in (200, 202):
            print(f"[OneSignal Success] HTTP {status_code}: Web Push broadcast accepted by OneSignal.")
            print(f"[OneSignal Response Body]: {response_body}")
            return True
        else:
            print(f"[OneSignal HTTP Error] Status Code: {status_code}", file=sys.stderr)
            print(f"[OneSignal Error Body]: {response_body}", file=sys.stderr)
            return False

    except Exception as exc:
        print(f"[OneSignal Exception] Request failed with exception: {exc}", file=sys.stderr)
        return False


# ==============================================================================
# 3. UNIFIED DISPATCHER & UNCONDITIONAL GREVES.JSON RUNNER
# ==============================================================================

def notify_all_channels(strike_item: Dict[str, Any]) -> Dict[str, bool]:
    """
    Dispatches alerts to both Telegram and OneSignal with isolated error handling.
    """
    empresa = strike_item.get("empresa") or strike_item.get("empresa_ou_entidade", "Greve")
    print(f"\n[Dispatch Service] Processing notification dispatch for: {empresa}...")

    results = {
        "telegram": False,
        "onesignal": False
    }

    # 1. Telegram Alert
    try:
        results["telegram"] = send_telegram_alert(strike_item)
    except Exception as e:
        print(f"[Telegram Top-Level Error]: {e}", file=sys.stderr)

    # 2. OneSignal Alert
    try:
        results["onesignal"] = send_onesignal_alert(strike_item)
    except Exception as e:
        print(f"[OneSignal Top-Level Error]: {e}", file=sys.stderr)

    print(f"[Dispatch Summary] Telegram: {'SUCCESS' if results['telegram'] else 'FAILED/OFF'} | "
          f"OneSignal: {'SUCCESS' if results['onesignal'] else 'FAILED/OFF'}\n")

    return results


def run_unconditional_notifications() -> int:
    """
    Unconditionally reads greves.json and triggers notifications to
    Telegram (@alertagreves_pt) and OneSignal for each strike found,
    without requiring any git diff or new changes.
    """
    print("\n" + "=" * 65)
    print("GrevesPT • Running Unconditional Alert Notifications...")
    print("=" * 65)

    check_keys_status()

    strikes: List[Dict[str, Any]] = []
    target_path = None
    for p in [DATA_FILE, PUBLIC_DATA_FILE]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        strikes = data
                        target_path = p
                        break
            except Exception as e:
                print(f"[Warning] Failed to read {p}: {e}", file=sys.stderr)

    if not strikes:
        print("[Notice] No strikes found in greves.json. Using official default strike...")
        strikes = [{
            "id": "metro-lisboa-20261014",
            "empresa": "Metropolitano de Lisboa, E.P.E.",
            "empresaSigla": "Metro de Lisboa",
            "setor": "Transportes",
            "regiao": "AML - Lisboa",
            "estado": "Confirmada",
            "gravidade": "alta",
            "gravidadeText": "High Severity / Alta Gravidade",
            "dataInicio": "2026-10-14T05:00:00",
            "dataFim": "2026-10-14T23:59:59",
            "horario": "05h00 às 10h00 (reabertura gradual e perturbações residuais)",
            "sindicato": "STRUP / FECTRANS / FESNINAS",
            "motivo": "Reivindicações salariais e contratação de pessoal de estação",
            "servicosMinimos": "O Tribunal Arbitral do CES não decretou serviços mínimos de circulação. Todas as quatro linhas encerradas no período matinal.",
            "fonteOficial": "https://www.metrolisboa.pt/avisos/"
        }]

    print(f"[Dispatch Pipeline] Found {len(strikes)} strike record(s) from {target_path or 'fallback'}.")
    print("Proceeding to dispatch alerts unconditionally to Telegram (@alertagreves_pt) and OneSignal...")

    sent_count = 0
    for strike in strikes:
        res = notify_all_channels(strike)
        if res.get("telegram") or res.get("onesignal"):
            sent_count += 1

    print("=" * 65)
    print(f"Unconditional Notification Complete: {len(strikes)} strike(s) processed.")
    print("=" * 65 + "\n")
    return len(strikes)


# Backward compatibility aliases
enviar_telegram = send_telegram_alert
enviar_onesignal_push = send_onesignal_alert


def check_keys_status() -> None:
    """Verifies and logs the presence of all 5 production environment variables."""
    keys = {
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "TELEGRAM_BOT_TOKEN": bool(os.getenv("TELEGRAM_BOT_TOKEN")),
        "TELEGRAM_CHAT_ID": bool(os.getenv("TELEGRAM_CHAT_ID")),
        "ONESIGNAL_APP_ID": bool(os.getenv("ONESIGNAL_APP_ID")),
        "ONESIGNAL_REST_API_KEY": bool(os.getenv("ONESIGNAL_REST_API_KEY")),
    }

    print("\n" + "=" * 65)
    print("GrevesPT • Production Keys Verification")
    print("=" * 65)
    for key, is_set in keys.items():
        status = "✅ Configured" if is_set else "⚠️ Not Set"
        print(f"  • {key:24}: {status}")
    print(f"  • Active TELEGRAM_CHAT_ID : {os.getenv('TELEGRAM_CHAT_ID') or '@alertagreves_pt'}")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    sample_strike = {
        "empresa": "Metropolitano de Lisboa, E.P.E.",
        "setor": "Transportes",
        "regiao": "AML - Lisboa",
        "estado": "Confirmada",
        "gravidade": "alta",
        "gravidadeText": "High Severity / Alta Gravidade",
        "dataInicio": "2026-10-14T05:00:00",
        "dataFim": "2026-10-14T23:59:59",
        "horario": "05h00 às 10h00 (reabertura gradual e perturbações residuais)",
        "motivo": "Reivindicações salariais e contratação de pessoal de estação",
        "servicosMinimos": "O Tribunal Arbitral do CES não decretou serviços mínimos de circulação. Todas as quatro linhas encerradas no período matinal.",
        "fonteOficial": "https://www.metrolisboa.pt/avisos/"
    }

    if "--status" in sys.argv or "--check" in sys.argv:
        check_keys_status()
    elif "--test-telegram" in sys.argv:
        send_telegram_alert(sample_strike)
    elif "--test-onesignal" in sys.argv:
        send_onesignal_alert(sample_strike)
    else:
        # Default behavior: run unconditionally reading greves.json!
        run_unconditional_notifications()
