# ga_protobuf_viewer.py
from mitmproxy import http
import requests
import secrets
import gzip, subprocess, importlib, os
import base64
import functools, builtins
import webbrowser, sys

# 설정: 필요시 수정
TARGET_PATH_PART = "/a"
PROTO_MODULE = "app_measurement_pb2"   # protoc로 생성한 모듈명 (예: app_measurement_pb2)
PROTO_MESSAGE = "Batch"                # 모듈 내 메시지 클래스명

# SERVER_URL = "http://192.168.1.17:5002/event"   # 수신 서버 URL
SERVER_URL = "http://210.114.9.23:7500/event"   # 수신 서버 URL
print = functools.partial(builtins.print, flush=True)
# brotli optional
try:
    import brotli
except Exception:
    brotli = None

PROBE_TOKEN = secrets.token_urlsafe(16)
# WEB_URL = f"http://192.168.1.17:5002/?tk={PROBE_TOKEN}"

WEB_URL = f"http://210.114.9.23:7500/?tk={PROBE_TOKEN}"
print("LET'S GO")
print("-----------------------------------------------------")
print(WEB_URL)
print("-----------------------------------------------------")
webbrowser.open_new_tab(WEB_URL)

def decompress(data: bytes, encoding: str):
    enc = (encoding or "").lower()
    if not data:
        return data
    if "gzip" in enc:
        try:
            return gzip.decompress(data)
        except:
            return data
    if "br" in enc or "brotli" in enc:
        if brotli is None:
            return data
        try:
            return brotli.decompress(data)
        except:
            return data
    return data

def try_parse_proto(raw: bytes):
    try:
        if len(raw) == 0:
            return None 
        mod = importlib.import_module(PROTO_MODULE)
        msg_cls = getattr(mod, PROTO_MESSAGE)
        msg = msg_cls()
        msg.ParseFromString(raw)
        # lazy import to avoid dependency unless needed
        from google.protobuf.json_format import MessageToDict
        # json타입
        msg_dict = MessageToDict(msg, preserving_proto_field_name=True)
        # sting타입
        # msg_json = json.dumps(msg_dict, ensure_ascii=False, indent=2)
        return msg_dict
        # return msg_json
    except Exception as e:
        print(e)
        return None

def try_decode_raw(raw: bytes):
    # requires protoc in PATH
    isLocal = os.path.join(os.path.dirname(os.path.abspath(__file__)), "protoc")
    if os.path.isfile(isLocal):
        PROTOC_PATH = isLocal
    else:
        PROTOC_PATH = 'protoc'
    try:
        proc = subprocess.run([PROTOC_PATH, "--decode_raw"], input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out = proc.stdout.decode("utf-8", errors="replace")
        return out if out.strip() else None
    except Exception as e:
        print("protoc decode error:", e)
        return None

def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_host.startswith("app-") and flow.request.path.startswith("/a"):
        raw = flow.request.raw_content or b""
        enc = flow.request.headers.get("content-encoding", "").lower()

        # 압축 해제
        if "gzip" in enc:
            import gzip
            raw = gzip.decompress(raw)
        elif "br" in enc:
            import brotli
            raw = brotli.decompress(raw)

        # protobuf 디코딩 시도
        parsed = try_parse_proto(raw)
        protoc_out = try_decode_raw(raw)

        if isinstance(protoc_out, bytes):
            protoc_out = base64.b64encode(protoc_out).decode("utf-8")   

        print("=== GA4 REQUEST DECODED ===")
        
        # payload: dict (not JSON string)
        payload = {
            "probe_token": PROBE_TOKEN,
            "data": parsed,
            "original_data": protoc_out,
            "platform": "iOS"
        }

        # payload_str = json.dumps(payload)
        try:
            resp = requests.post(SERVER_URL, json=payload)
            print("[POST] status:", resp.status_code)
        except Exception as e:
            print("[POST ERROR]", e)

        return parsed or protoc_out