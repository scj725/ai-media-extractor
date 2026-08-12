"""Parser for the current qianwen.my.cn share-page format."""

import json
import re
from collections.abc import Iterator

from .network import create_http_client


def _walk(value: object) -> Iterator[dict]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


async def load_share_data(url: str, return_raw: bool = False) -> list[dict] | dict:
    headers = {
        "origin": "https://qianwen.my.cn",
        "referer": url,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    }
    async with create_http_client() as client:
        response = await client.get(url, headers=headers, follow_redirects=True)
        response.raise_for_status()
        html = response.text

    parsed: list[dict] = []
    for script in re.findall(r"<script[^>]*>(.*?)</script>", html, re.DOTALL | re.IGNORECASE):
        match = re.search(r"\.push\((\{.*\})\);", script, re.DOTALL)
        if not match:
            continue
        try:
            parsed.append(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue

    has_media_data = any(
        node.get("type") in {"ai_generate_image_list", "ai_generate_video"}
        and isinstance(node.get("content"), dict)
        and isinstance(node["content"].get("resource_infos"), list)
        for value in parsed
        for node in _walk(value)
    )

    if not has_media_data:
        share_id = url.split("?", 1)[0].rsplit("/", 1)[-1]
        api_headers = {
            "origin": "https://qianwen.my.cn",
            "referer": url,
            "content-type": "application/json",
            "user-agent": headers["user-agent"],
        }
        async with create_http_client() as client:
            api_response = await client.post(
                "https://chat2-api.qianwen.com/api/v1/share/info",
                json={"share_id": share_id, "biz_id": "ai_qwen"},
                headers=api_headers,
            )
            api_response.raise_for_status()
            try:
                api_data = api_response.json()
            except json.JSONDecodeError:
                api_data = None
        if isinstance(api_data, dict):
            parsed.append(api_data)
            has_media_data = any(
                node.get("type") in {"ai_generate_image_list", "ai_generate_video"}
                and isinstance(node.get("content"), dict)
                and isinstance(node["content"].get("resource_infos"), list)
                for value in parsed
                for node in _walk(value)
            )

    # Some CDN responses omit inline script boundaries or wrap data differently.
    if not has_media_data:
        urls = re.findall(r"https://workspace-zb-cdn\.qianwen\.com/[^\"'\\\s]+", html)
        urls = [item.replace("&amp;", "&") for item in urls]
        image_urls = [u for u in urls if re.search(r"\.(?:png|jpe?g|webp)(?:\?|$)", u, re.I)]
        video_urls = [u for u in urls if re.search(r"\.mp4(?:\?|$)", u, re.I)]
        if image_urls:
            parsed.append({"type": "ai_generate_image_list", "content": {"resource_infos": [{"url": u} for u in image_urls]}})
        if video_urls:
            parsed.append({"type": "ai_generate_video", "content": {"resource_infos": [{"url": u} for u in video_urls]}})

    if return_raw:
        return parsed
    if not parsed:
        raise KeyError("无法解析千问分享页数据")
    return parsed


async def qianwen_my_image_parse(url: str, return_raw: bool = False) -> list[dict] | dict:
    data = await load_share_data(url, return_raw=return_raw)
    if return_raw:
        return data

    images = []
    seen = set()
    for node in _walk(data):
        if node.get("type") != "ai_generate_image_list":
            continue
        content = node.get("content")
        if not isinstance(content, dict) or not isinstance(content.get("resource_infos"), list):
            continue
        for item in content["resource_infos"]:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            item_url = item["url"].replace("&amp;", "&")
            if not re.search(r"\.(?:png|jpe?g|webp)(?:\?|$)", item_url, re.IGNORECASE) or item_url in seen:
                continue
            seen.add(item_url)
            images.append({"url": item_url, "width": item.get("width", 0), "height": item.get("height", 0)})
    return images


async def qianwen_my_video_parse(url: str, return_raw: bool = False) -> list[dict] | dict:
    data = await load_share_data(url, return_raw=return_raw)
    if return_raw:
        return data

    videos = []
    seen = set()
    for node in _walk(data):
        if node.get("type") != "ai_generate_video":
            continue
        content = node.get("content")
        if not isinstance(content, dict) or not isinstance(content.get("resource_infos"), list):
            continue
        for item in content["resource_infos"]:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            item_url = item["url"].replace("&amp;", "&")
            if not re.search(r"\.mp4(?:\?|$)", item_url, re.IGNORECASE) or item_url in seen:
                continue
            seen.add(item_url)
            videos.append(
                {
                    "url": item_url,
                    "width": item.get("width", 0),
                    "height": item.get("height", 0),
                    "definition": f"{item.get('height', 0)}p" if item.get("height") else "",
                }
            )
    return videos
