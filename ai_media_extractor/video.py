"""Video parsers for Doubao and Jianying/Yunque share pages."""

import base64
import hashlib
import html
import json
import re
import urllib.parse
from collections.abc import Iterable
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from .network import create_http_client


QAAB_SALT = bytes.fromhex(
    "4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524"
    "f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58"
)


def get_query_params(url: str, param_name: Optional[str] = None) -> dict | list[str]:
    query_params = parse_qs(urlparse(url).query)
    return query_params if param_name is None else query_params.get(param_name, [])


def _decode_escaped(value: str) -> str:
    """Decode a URL captured from HTML or JSON without changing its query data."""
    value = html.unescape(value).strip()
    for _ in range(3):
        try:
            decoded = json.loads(f'"{value.replace(chr(34), chr(92) + chr(34))}"')
        except (json.JSONDecodeError, ValueError):
            break
        if decoded == value:
            break
        value = decoded
    return value.replace("\\/", "/")


def _find_fallback_apis(page: str) -> list[str]:
    # Share-page JSON is escaped multiple times. Capture until the next escaped
    # JSON quote, then normalize the resulting URL below.
    patterns = (r'(?:fallback_api|fallbackApi).*?(https:.*?)(?:\\+&quot;|&quot;|")',)
    found: list[str] = []
    for pattern in patterns:
        for match in re.finditer(pattern, page, re.DOTALL):
            value = _decode_escaped(match.group(1))
            if value.startswith(("https://", "http://")) and value not in found:
                found.append(value)
    return found


def _with_no_watermark_options(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    options = {"channel": "no", "codec_type": "8", "logo_type": "unwatermarked"}
    query = [(key, options.pop(key, value)) for key, value in query]
    query.extend(options.items())
    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def _base64_decode_loose(value: str) -> bytes | None:
    raw = str(value or "").strip()
    variants = (raw, raw.translate(str.maketrans({"$": "_", "@": "/", "#": "."})), raw.translate(str.maketrans({"$": "+", "@": "/", "#": "="})))
    for candidate in dict.fromkeys(variants):
        try:
            return base64.b64decode(candidate.replace("-", "+").replace("_", "/") + "=" * (-len(candidate) % 4))
        except (ValueError, UnicodeEncodeError):
            continue
    return None


def _url_from_bytes(value: bytes) -> str:
    try:
        text = value.decode("ascii").strip()
    except UnicodeDecodeError:
        return ""
    # Some qAAB payloads retain PKCS padding after the signed query string.
    # A URL cannot contain ASCII control bytes, so discard that suffix.
    text = re.split(r"[\x00-\x1f\x7f]", text, maxsplit=1)[0]
    return text if text.startswith(("https://", "http://")) else ""


def _strip_pkcs7(value: bytes) -> bytes:
    if not value:
        return value
    padding = value[-1]
    return value[:-padding] if 0 < padding <= len(value) and value[-padding:] == bytes([padding]) * padding else value


def _decrypt_qaab(token: str, key_seed: str) -> str:
    token_bytes, seed_bytes = _base64_decode_loose(token), _base64_decode_loose(key_seed)
    if not token_bytes or not seed_bytes:
        return ""
    seed_hash = hashlib.sha512(seed_bytes[:32]).digest()
    derived = hashlib.sha512(seed_hash + QAAB_SALT).digest()
    key_a, key_b = derived[:16], derived[16:32]
    attempts: list[tuple[bytes, bytes, bytes]] = []
    if token_bytes.startswith(b"\xa8\x00\x01\x00"):
        attempts.extend(((token_bytes[4:], key_a, key_b), (token_bytes[4:], key_b, key_a)))
        if len(token_bytes) > 36:
            attempts.extend(((token_bytes[36:], key_a, token_bytes[20:36]), (token_bytes[36:], key_a, key_b)))
    else:
        attempts.append((token_bytes, key_a, key_b))
    for payload, key, iv in attempts:
        if not payload or len(payload) % 16:
            continue
        try:
            decrypted = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor().update(payload)
        except ValueError:
            continue
        url = _url_from_bytes(decrypted) or _url_from_bytes(_strip_pkcs7(decrypted))
        if url:
            return url
    return ""


def _find_key_seed(value: Any, depth: int = 0) -> str:
    if depth > 10 or value is None:
        return ""
    if isinstance(value, str):
        match = re.search(r'(?:^|[?&])key_seed=([^&"\'<>\\\s]+)', value)
        return urllib.parse.unquote(match.group(1)) if match else ""
    if isinstance(value, dict):
        direct = value.get("key_seed")
        if isinstance(direct, str) and direct:
            return direct
        for child in value.values():
            found = _find_key_seed(child, depth + 1)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_key_seed(child, depth + 1)
            if found:
                return found
    return ""


def _video_candidates(payload: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    root = payload.get("video_info") or payload.get("data", {}).get("video_info") or payload
    data = root.get("data", root) if isinstance(root, dict) else {}
    video_list = data.get("video_list") if isinstance(data, dict) else None
    return [item for item in video_list.values() if isinstance(item, dict)] if isinstance(video_list, dict) else [data]


def _resolve_main_url(payload: Any) -> tuple[str, dict[str, Any]]:
    best: tuple[int, str, dict[str, Any]] | None = None
    for item in _video_candidates(payload):
        token = item.get("main_url") or item.get("play_url") or ""
        if not isinstance(token, str) or not token.strip():
            continue
        score = int(item.get("bitrate") or item.get("real_bitrate") or 0) + int(item.get("vwidth") or item.get("width") or 0) * int(item.get("vheight") or item.get("height") or 0)
        if best is None or score > best[0]:
            best = (score, token.strip(), item)
    if not best:
        return "", {}
    token, item = best[1], best[2]
    if token.startswith(("https://", "http://")):
        return token, item
    return _url_from_bytes(_base64_decode_loose(token) or b"") or _decrypt_qaab(token, _find_key_seed(payload)), item


async def _resolve_fallback_api(client: httpx.AsyncClient, fallback_api: str, headers: dict[str, str]) -> tuple[str, dict[str, Any], Any]:
    response = await client.get(_with_no_watermark_options(fallback_api), headers=headers)
    response.raise_for_status()
    payload = response.json()
    url, meta = _resolve_main_url(payload)
    return url, meta, payload


async def get_doubao_vid(url: str) -> list[str]:
    headers = {"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36"}
    async with create_http_client() as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
    return list(set(re.findall(r'{\\&quot;vid\\&quot;:\\&quot;(.*?)\\&quot', response.text)))


async def doubao_video_parse(url: str, return_raw: bool = False) -> list:
    if "/thread/" not in url:
        raise ValueError("请使用豆包对话分享链接（包含 /thread/）。")
    headers = {
        "accept": "application/json,text/plain,*/*",
        "origin": "https://www.doubao.com",
        "referer": "https://www.doubao.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    }
    try:
        async with create_http_client() as client:
            page = await client.get(url, headers=headers)
            page.raise_for_status()
            fallback_apis = _find_fallback_apis(page.text)
            if not fallback_apis:
                raise ValueError("未在分享页中找到无水印视频接口；该视频可能需要在已登录豆包页面内下载。")
            resolved: list[dict[str, Any]] = []
            raw: list[Any] = []
            for fallback_api in fallback_apis:
                media_url, meta, payload = await _resolve_fallback_api(client, fallback_api, headers)
                raw.append(payload)
                if not media_url:
                    continue
                video_info = payload.get("video_info", {}) if isinstance(payload, dict) else {}
                response_data = video_info.get("data", {}) if isinstance(video_info, dict) else {}
                duration = meta.get("duration") or response_data.get("video_duration") or meta.get("duration_ms") or 0
                resolved.append({
                    "width": int(meta.get("vwidth") or meta.get("width") or 0),
                    "height": int(meta.get("vheight") or meta.get("height") or 0),
                    "definition": meta.get("definition") or "",
                    "duration": float(duration) / (1000 if meta.get("duration_ms") and not meta.get("duration") else 1),
                    "codec_type": meta.get("codec_type") or "",
                    "poster_url": response_data.get("poster_url") or "",
                    "url": media_url,
                    "source": "doubao-fallback-unwatermarked",
                })
            if return_raw:
                return raw
            if not resolved:
                raise ValueError("豆包未返回可用的无水印视频地址；请在浏览器登录豆包后使用扩展下载。")
            return resolved
    except httpx.RequestError as exc:
        raise ValueError(f"网络请求失败，请检查代理或网络连接：{exc}") from exc


async def get_redirect_url(url: str) -> str:
    headers = {"content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36"}
    async with create_http_client() as client:
        response = await client.get(url, headers=headers, follow_redirects=True)
        return str(response.url)


async def yunque_video_parse(url: str, return_raw: bool = False) -> list:
    headers = {"content-type": "application/json", "origin": "https://xiaoyunque.jianying.com", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36"}
    redirect_url = await get_redirect_url(url)
    params_dict = urllib.parse.parse_qs(urllib.parse.urlparse(redirect_url).query)
    json_data = {"query_params": {"content_type": "video", "home_input_type": "VIDEO_PART", "scene": "agent_tool", "share_campaign_key": "pippit_invite_fission", "share_id": params_dict["share_id"][0], "share_sec_did": params_dict["share_sec_did"][0], "share_sec_uid": params_dict["share_sec_uid"][0]}}
    async with create_http_client() as client:
        response = await client.post("https://xiaoyunque.jianying.com/luckycat/cn/jianying/campaign/v1/pippit/share/landing_page", headers=headers, json=json_data)
        result = response.json()
    if return_raw:
        return result
    try:
        video_info = result["data"]["page_info"]["generate_page"]["item_info"]["video_info"][0]
        return [{"url": video_info["video_url"], "width": video_info["width"], "height": video_info["height"], "definition": f"{video_info['width']}p", "poster_url": video_info["cover_url"]}]
    except (KeyError, IndexError, TypeError) as exc:
        raise KeyError("无法获取视频播放信息，请检查链接是否有效。") from exc
