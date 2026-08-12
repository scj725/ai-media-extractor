"""HTTP client helpers with support for environment and Windows system proxies."""

import os
import sys
from urllib.parse import urlparse

import httpx


def _windows_proxy() -> str | None:
    if sys.platform != "win32":
        return None

    try:
        import winreg

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            enabled = winreg.QueryValueEx(key, "ProxyEnable")[0]
            server = winreg.QueryValueEx(key, "ProxyServer")[0]
    except (FileNotFoundError, OSError):
        return None

    if not enabled or not server:
        return None

    # Windows supports either a single proxy or per-scheme values.
    values = {}
    for item in str(server).split(";"):
        if "=" in item:
            scheme, value = item.split("=", 1)
            values[scheme.strip().lower()] = value.strip()
        else:
            values["default"] = item.strip()

    proxy = values.get("https") or values.get("http") or values.get("default")
    if not proxy:
        return None
    return proxy if urlparse(proxy).scheme else f"http://{proxy}"


def create_http_client() -> httpx.AsyncClient:
    """Create an AsyncClient using configured or Windows system proxy settings."""

    proxy = (
        os.getenv("HTTPS_PROXY")
        or os.getenv("https_proxy")
        or os.getenv("HTTP_PROXY")
        or os.getenv("http_proxy")
        or _windows_proxy()
    )
    options = {"trust_env": True, "timeout": 30.0}
    if proxy:
        options["proxy"] = proxy
    return httpx.AsyncClient(**options)
