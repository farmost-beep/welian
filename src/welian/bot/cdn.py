"""CDN crypto + upload/download for WeChat ilink media.

Ports wechat-claude-code's cdn.ts/upload.ts/crypto.ts to Python.
Uses the `cryptography` library for AES-128-ECB.
"""
import os
import hashlib
import urllib.request
import urllib.error
import urllib.parse
import logging
from pathlib import Path
from typing import Optional, Tuple

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger("welian.bot.cdn")

CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c"
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"}

# Upload media types (from ilink protocol)
UPLOAD_IMAGE = 1
UPLOAD_VIDEO = 2
UPLOAD_FILE = 3
UPLOAD_VOICE = 4


# ── AES-128-ECB ──

def _pkcs7_pad(data: bytes) -> bytes:
    block = 16
    pad_len = block - (len(data) % block)
    return data + bytes([pad_len] * pad_len)


def _pkcs7_unpad(data: bytes) -> bytes:
    if not data:
        return data
    pad_len = data[-1]
    if pad_len < 1 or pad_len > 16:
        return data  # not padded, return as-is
    return data[:-pad_len]


def encrypt_aes_ecb(key: bytes, plaintext: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
    encryptor = cipher.encryptor()
    return encryptor.update(_pkcs7_pad(plaintext)) + encryptor.finalize()


def decrypt_aes_ecb(key: bytes, ciphertext: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
    decryptor = cipher.decryptor()
    decrypted = decryptor.update(ciphertext) + decryptor.finalize()
    return _pkcs7_unpad(decrypted)


def aes_ecb_padded_size(size: int) -> int:
    block = 16
    return ((size + block - 1) // block) * block


# ── CDN download ──

def download_and_decrypt(encrypt_query_param: str, aes_key_b64: str) -> bytes:
    """Download from CDN and AES-decrypt.

    Args:
        encrypt_query_param: CDN encrypted query param
        aes_key_b64: AES key as base64 (either raw-16-bytes or hex-string encoded)

    Returns:
        Decrypted file bytes.
    """
    import base64

    url = f"{CDN_BASE_URL}/download?encrypted_query_param={urllib.parse.quote(encrypt_query_param, safe='')}"

    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        encrypted = resp.read()

    # Decode AES key — handle both formats:
    # 1. base64-of-raw-16-bytes
    # 2. base64-of-hex-string (32 hex chars encoded as base64)
    raw = base64.b64decode(aes_key_b64)
    if len(raw) == 16:
        aes_key = raw
    else:
        hex_str = raw.decode("utf-8")
        aes_key = bytes.fromhex(hex_str)

    decrypted = decrypt_aes_ecb(aes_key, encrypted)
    logger.info(f"CDN download+decrypt OK: {len(decrypted)} bytes")
    return decrypted


# ── CDN upload ──

def _upload_to_cdn(upload_url: str, encrypted: bytes) -> str:
    """Upload encrypted bytes to CDN, return encrypt_query_param from response header."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                upload_url,
                data=encrypted,
                method="POST",
                headers={"Content-Type": "application/octet-stream"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                param = resp.headers.get("x-encrypted-param")
                if not param:
                    raise ValueError("CDN upload succeeded but no x-encrypted-param header")
                return param
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if 400 <= e.code < 500:
                raise ValueError(f"CDN upload 4xx: {e.code} {body[:200]}")
            logger.warning(f"CDN upload {e.code}, retry {attempt+1}/3")
            continue
    raise ValueError("CDN upload failed after 3 retries")


def upload_file(
    api,  # IlinkApi instance
    to_user_id: str,
    file_path: str,
) -> dict:
    """Encrypt + upload a file to WeChat CDN.

    Returns dict with: media_type ('image'|'file'), encrypt_query_param,
    aes_key_hex, file_name, file_size, raw_size.
    """
    import base64
    import secrets

    path = Path(file_path)
    raw_size = path.stat().st_size
    if raw_size > MAX_FILE_SIZE:
        raise ValueError(f"文件过大 ({raw_size / 1048576:.1f}MB)，最大支持 25MB")

    file_name = path.name
    ext = path.suffix.lower()
    is_image = ext in IMAGE_EXTENSIONS
    media_type = UPLOAD_IMAGE if is_image else UPLOAD_FILE

    plaintext = path.read_bytes()
    raw_md5 = hashlib.md5(plaintext).hexdigest()
    file_size = aes_ecb_padded_size(raw_size)

    file_key = secrets.token_hex(16)  # 32-hex-char
    aes_key = secrets.token_bytes(16)  # 16 raw bytes
    aes_key_hex = aes_key.hex()

    # Get upload URL from ilink
    upload_resp = api.get_upload_url(
        filekey=file_key,
        media_type=media_type,
        to_user_id=to_user_id,
        rawsize=raw_size,
        rawfilemd5=raw_md5,
        file_size=file_size,
        aeskey=aes_key_hex,
    )

    upload_param = upload_resp.get("upload_param")
    upload_full_url = upload_resp.get("upload_full_url")

    if upload_full_url:
        upload_url = upload_full_url
    elif upload_param:
        upload_url = f"{CDN_BASE_URL}/upload?encrypted_query_param={urllib.parse.quote(upload_param, safe='')}&filekey={file_key}"
    else:
        raise ValueError(f"获取上传地址失败: {upload_resp}")

    # Encrypt + upload
    encrypted = encrypt_aes_ecb(aes_key, plaintext)
    encrypt_query_param = _upload_to_cdn(upload_url, encrypted)

    logger.info(f"CDN upload OK: {file_name} ({raw_size} bytes, type={'image' if is_image else 'file'})")

    return {
        "media_type": "image" if is_image else "file",
        "encrypt_query_param": encrypt_query_param,
        "aes_key_hex": aes_key_hex,
        "file_name": file_name,
        "file_size": file_size,
        "raw_size": raw_size,
    }


# ── MIME detection ──

def detect_mime(data: bytes) -> str:
    if data[:2] == b'\x89\x50':
        return "image/png"
    if data[:2] == b'\xff\xd8':
        return "image/jpeg"
    if data[:2] == b'\x47\x49':
        return "image/gif"
    if data[:2] == b'\x52\x49':
        return "image/webp"
    if data[:2] == b'\x42\x4d':
        return "image/bmp"
    return "image/jpeg"
