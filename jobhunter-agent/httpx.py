"""Zero-dependency standard-library drop-in implementation of `httpx` (`AsyncClient`, `Timeout`, `Response`).

Ensures `jobhunter-agent` runs reliably in any Python 3.10+ environment (including Cloud Run and container
sandboxes) even when external pip packages are not pre-installed.
"""
from __future__ import annotations

import asyncio
import json as _json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class Timeout:
    def __init__(self, timeout: float | int = 20.0, **kwargs: Any):
        if isinstance(timeout, Timeout):
            self.timeout = float(timeout.timeout)
        else:
            self.timeout = float(timeout or 20.0)
        self.extra = kwargs

    def as_float(self) -> float:
        return self.timeout


class Headers:
    """Case-insensitive HTTP headers mapping."""

    def __init__(self, raw_headers: dict[str, str] | list[tuple[str, str]] | None = None):
        self._store: dict[str, str] = {}
        if isinstance(raw_headers, dict):
            for k, v in raw_headers.items():
                self._store[str(k).lower()] = str(v)
        elif isinstance(raw_headers, list):
            for k, v in raw_headers:
                self._store[str(k).lower()] = str(v)

    def get(self, key: str, default: Any = None) -> Any:
        return self._store.get(str(key).lower(), default)

    def __getitem__(self, key: str) -> str:
        return self._store[str(key).lower()]

    def __contains__(self, key: object) -> bool:
        return str(key).lower() in self._store

    def items(self):
        return self._store.items()


class Response:
    def __init__(
        self,
        status_code: int,
        content: bytes,
        headers: dict[str, str] | list[tuple[str, str]] | None = None,
        url: str = "",
    ):
        self.status_code = int(status_code)
        self.content = content or b""
        self.headers = Headers(headers)
        self.url = str(url)
        self._text: str | None = None

    @property
    def text(self) -> str:
        if self._text is None:
            charset = "utf-8"
            ctype = self.headers.get("content-type", "")
            if "charset=" in ctype.lower():
                try:
                    charset = ctype.lower().split("charset=")[-1].split(";")[0].strip() or "utf-8"
                except Exception:
                    charset = "utf-8"
            try:
                self._text = self.content.decode(charset, errors="replace")
            except LookupError:
                self._text = self.content.decode("utf-8", errors="replace")
        return self._text

    def json(self) -> Any:
        return _json.loads(self.text)


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def http_error_301(self, req, fp, code, msg, headers):
        return fp

    def http_error_302(self, req, fp, code, msg, headers):
        return fp

    def http_error_303(self, req, fp, code, msg, headers):
        return fp

    def http_error_307(self, req, fp, code, msg, headers):
        return fp

    def http_error_308(self, req, fp, code, msg, headers):
        return fp


class HTTPError(Exception):
    pass


class RequestError(HTTPError):
    pass


class AsyncClient:
    """Async HTTP client compatible with `httpx.AsyncClient` backed by Python's stdlib `urllib.request`."""

    def __init__(
        self,
        *,
        follow_redirects: bool = False,
        timeout: float | int | Timeout = 20.0,
        headers: dict[str, str] | None = None,
        **kwargs: Any,
    ):
        self.follow_redirects = bool(follow_redirects)
        self.timeout = timeout.as_float() if isinstance(timeout, Timeout) else float(timeout or 20.0)
        self.default_headers: dict[str, str] = {
            "User-Agent": "Mozilla/5.0 (compatible; JobHunterBot/1.2)",
        }
        if headers:
            self.default_headers.update(headers)
        self._closed = False

    async def __aenter__(self) -> AsyncClient:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        self._closed = True

    def _sync_request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        data: dict[str, Any] | bytes | str | None = None,
        content: bytes | str | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | int | Timeout | None = None,
    ) -> Response:
        target_url = str(url)
        if params:
            qs = urllib.parse.urlencode(params, doseq=True)
            sep = "&" if "?" in target_url else "?"
            target_url = f"{target_url}{sep}{qs}"

        merged_headers = dict(self.default_headers)
        if headers:
            merged_headers.update(headers)

        body_bytes: bytes | None = None
        if json is not None:
            body_bytes = _json.dumps(json).encode("utf-8")
            merged_headers.setdefault("Content-Type", "application/json; charset=utf-8")
        elif content is not None:
            body_bytes = content.encode("utf-8") if isinstance(content, str) else bytes(content)
        elif data is not None:
            if isinstance(data, dict):
                body_bytes = urllib.parse.urlencode(data, doseq=True).encode("utf-8")
                merged_headers.setdefault("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
            elif isinstance(data, str):
                body_bytes = data.encode("utf-8")
            else:
                body_bytes = bytes(data)

        req_timeout = (
            timeout.as_float()
            if isinstance(timeout, Timeout)
            else float(timeout)
            if timeout is not None
            else self.timeout
        )

        req = urllib.request.Request(target_url, data=body_bytes, headers=merged_headers, method=method.upper())
        ctx = ssl.create_default_context()
        https_handler = urllib.request.HTTPSHandler(context=ctx)

        if self.follow_redirects:
            opener = urllib.request.build_opener(https_handler)
        else:
            opener = urllib.request.build_opener(https_handler, _NoRedirectHandler)

        try:
            with opener.open(req, timeout=req_timeout) as resp:
                status = getattr(resp, "status", None) or resp.getcode() or 200
                raw_bytes = resp.read(2_000_000)
                resp_headers = list(resp.headers.items()) if hasattr(resp, "headers") else []
                final_url = resp.geturl() if hasattr(resp, "geturl") else target_url
                return Response(status_code=status, content=raw_bytes, headers=resp_headers, url=final_url)
        except urllib.error.HTTPError as e:
            try:
                err_bytes = e.read(500_000) if e.fp else b""
            except Exception:
                err_bytes = b""
            err_headers = list(e.headers.items()) if e.headers else []
            return Response(status_code=e.code, content=err_bytes, headers=err_headers, url=e.geturl() or target_url)
        except Exception as e:
            raise RequestError(str(e)) from e

    async def request(self, method: str, url: str, **kwargs: Any) -> Response:
        return await asyncio.to_thread(self._sync_request, method, url, **kwargs)

    async def get(self, url: str, **kwargs: Any) -> Response:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> Response:
        return await self.request("POST", url, **kwargs)
