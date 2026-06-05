"""Minimal Douyin IM protobuf helpers.

The IM send endpoints use a small protobuf envelope. Keeping the encoder local
avoids requiring protoc during source or packaged runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _varint(value: int) -> bytes:
    value = int(value)
    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def _key(field: int, wire_type: int) -> bytes:
    return _varint((field << 3) | wire_type)


def _int_field(field: int, value: int) -> bytes:
    return _key(field, 0) + _varint(value)


def _bytes_field(field: int, value: bytes) -> bytes:
    return _key(field, 2) + _varint(len(value)) + value


def _string_field(field: int, value: str) -> bytes:
    data = str(value or "").encode("utf-8")
    return _bytes_field(field, data)


def _map_entry(field: int, key: str, value: str) -> bytes:
    entry = _string_field(1, key) + _string_field(2, value)
    return _bytes_field(field, entry)


def _packed_ints_field(field: int, values: list[int]) -> bytes:
    payload = b"".join(_varint(value) for value in values)
    return _bytes_field(field, payload)


@dataclass
class ConversationInfo:
    conversation_id: str
    conversation_short_id: int
    conversation_type: int
    ticket: str


@dataclass
class SentMessageInfo:
    conversation_id: str
    conversation_short_id: int
    conversation_type: int
    server_message_id: int
    index_in_conversation: int
    sender: int
    content: str


def build_request(
    *,
    cmd: int,
    token: str,
    ts_sign: str,
    sdk_cert: str,
    request_sign: str,
    body: bytes,
    headers: dict[str, str],
    sequence_id: int,
    sdk_version: str = "1.1.3",
    build_number: str = "5fa6ff1:Detached: 5fa6ff1111fd53aafc4c753505d3c93daad74d27",
    inbox_type: int = 0,
    device_platform: str = "douyin_pc",
    auth_type: int = 4,
    biz: str = "douyin_web",
) -> bytes:
    payload = bytearray()
    payload += _int_field(1, cmd)
    payload += _int_field(2, sequence_id)
    payload += _string_field(3, sdk_version)
    payload += _string_field(4, token)
    payload += _int_field(5, 3)
    payload += _int_field(6, inbox_type)
    payload += _string_field(7, build_number)
    payload += _bytes_field(8, body)
    payload += _string_field(9, "0")
    payload += _string_field(11, device_platform)
    for key, value in headers.items():
        payload += _map_entry(15, key, value)
    payload += _int_field(18, auth_type)
    payload += _string_field(21, biz)
    payload += _string_field(22, "web_sdk")
    payload += _string_field(23, ts_sign)
    payload += _string_field(24, sdk_cert)
    if request_sign:
        payload += _string_field(25, request_sign)
    return bytes(payload)


def build_create_conversation_body(to_uid: int, my_uid: int) -> bytes:
    inner = _int_field(1, 1) + _packed_ints_field(2, [to_uid, my_uid])
    return _bytes_field(609, inner)


def build_send_message_body(
    *,
    conversation_id: str,
    conversation_short_id: int,
    ticket: str,
    content: str,
    client_message_id: str,
    now_ms: int,
    message_type: int = 7,
) -> bytes:
    ext_client_id = _string_field(1, "s:client_message_id") + _string_field(2, client_message_id)
    ext_time = _string_field(1, "s:stime") + _string_field(2, str(now_ms))
    ext_mentions = _string_field(1, "s:mentioned_users") + _string_field(2, "")
    inner = bytearray()
    inner += _string_field(1, conversation_id)
    inner += _int_field(2, 1)
    inner += _int_field(3, conversation_short_id)
    inner += _string_field(4, content)
    inner += _bytes_field(5, ext_mentions)
    inner += _bytes_field(5, ext_client_id)
    inner += _bytes_field(5, ext_time)
    inner += _int_field(6, int(message_type or 7))
    inner += _string_field(7, ticket)
    inner += _string_field(8, client_message_id)
    return _bytes_field(100, bytes(inner))


def build_messages_per_user_init_body(cursor: int = 0) -> bytes:
    inner = _int_field(1, int(cursor or 0))
    return _bytes_field(203, inner)


def build_get_user_message_body(cursor: int = 0) -> bytes:
    inner = bytearray()
    inner += _bytes_field(1, _int_field(1, int(cursor or 0)) + _int_field(3, 0) + _bytes_field(4, _int_field(1, 0) + _int_field(2, 0)))
    return _bytes_field(128, bytes(inner))


def build_get_conversation_info_list_body(
    *,
    conversation_id: str,
    conversation_short_id: int,
    conversation_type: int = 1,
) -> bytes:
    item = bytearray()
    item += _string_field(1, conversation_id)
    item += _int_field(2, int(conversation_short_id or 0))
    item += _int_field(3, int(conversation_type or 1))
    return _bytes_field(610, _bytes_field(1, bytes(item)))


def build_get_by_conversation_body(
    *,
    conversation_id: str,
    conversation_short_id: int,
    conversation_type: int = 1,
    cursor: int = 0,
    count: int = 50,
) -> bytes:
    inner = bytearray()
    inner += _string_field(1, conversation_id)
    inner += _int_field(2, int(conversation_type or 1))
    inner += _int_field(3, int(conversation_short_id or 0))
    inner += _int_field(4, 1)
    if int(cursor or 0) > 0:
        inner += _int_field(5, int(cursor or 0))
    inner += _int_field(6, max(1, min(int(count or 50), 100)))
    return _bytes_field(301, bytes(inner))


def parse_response(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    body = _first_bytes(fields, 6)
    cmd = _first_int(fields, 1)
    return {
        "cmd": cmd,
        "sequence_id": _first_int(fields, 2),
        "error_desc": _first_string(fields, 3),
        "message": _first_string(fields, 4),
        "body": parse_response_body(body, cmd=cmd) if body else {},
    }


def parse_response_body(data: bytes, cmd: int = 0) -> dict[str, Any]:
    fields = _parse_fields(data)
    by_conversation = _first_bytes(fields, 301)
    if by_conversation:
        return {"get_by_conversation_body": parse_messages_by_conversation(by_conversation)}
    user_message = _first_bytes(fields, 128)
    if user_message:
        return {"get_user_message_body": parse_messages_by_conversation(user_message)}
    history = _first_bytes(fields, 203)
    if history:
        return {"messages_per_user_init_v2_body": parse_messages_per_user_init(history)}
    notify = _first_bytes(fields, 500)
    if notify:
        return {"new_message_notify": parse_new_message_notify(notify)}
    create = _first_bytes(fields, 609)
    if create:
        return {"create_conversation_v2_body": parse_conversation_info_list(create)}
    info_list = _first_bytes(fields, 610)
    if info_list:
        return {"get_conversation_info_list_body": parse_conversation_info_list(info_list)}
    if cmd in (128, 301) and data:
        return {"get_by_conversation_body": parse_messages_by_conversation(data)}
    return {}


def parse_conversation_info_list(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    conversations = []
    for raw in fields.get(1, []):
        if raw[0] == 2:
            conversations.append(parse_conversation_info(raw[1]))
    return {"conversation_info_list": conversations}


def parse_conversation_info(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    return {
        "conversation_id": _first_string(fields, 1),
        "conversation_short_id": _first_int(fields, 2),
        "conversation_type": _first_int(fields, 3),
        "ticket": _first_string(fields, 4),
    }


def parse_new_message_notify(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    message = _first_bytes(fields, 5)
    return {
        "conversation_id": _first_string(fields, 2),
        "conversation_type": _first_int(fields, 3),
        "notify_type": _first_int(fields, 4),
        "message": parse_message_body(message) if message else {},
    }


def parse_message_body(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    ext = {}
    for field in (9, 15):
        for raw in fields.get(field, []):
            if raw[0] == 2:
                entry_fields = _parse_fields(raw[1])
                key = _first_string(entry_fields, 1)
                value = _first_string(entry_fields, 2)
                if key:
                    ext[key] = value
    return {
        "conversation_id": _first_string(fields, 1),
        "conversation_type": _first_int(fields, 2),
        "server_message_id": _first_int(fields, 3),
        "index_in_conversation": _first_int(fields, 4),
        "conversation_short_id": _first_int(fields, 5),
        "message_type": _first_int(fields, 6),
        "sender": _first_int(fields, 7),
        "content": _first_string(fields, 8),
        "create_time": _first_int(fields, 9),
        "status": _first_int(fields, 11),
        "order_in_conversation": _first_int(fields, 12),
        "ext": ext,
        "sec_sender": _first_string(fields, 18) or _first_string(fields, 16) or _first_string(fields, 14),
    }


def parse_messages_per_user_init(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    messages = []
    conversations = []
    for raw in fields.get(1, []):
        if raw[0] == 2:
            messages.append(parse_message_body(raw[1]))
    for raw in fields.get(2, []):
        if raw[0] == 2:
            conversations.append(parse_conversation_info(raw[1]))
    return {
        "messages": messages,
        "conversations": conversations,
        "per_user_cursor": _first_int(fields, 3),
        "next_cursor": _first_int(fields, 4),
        "has_more": bool(_first_int(fields, 5)),
    }


def parse_messages_by_conversation(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    messages = []
    for raw in fields.get(1, []):
        if raw[0] == 2:
            messages.append(parse_message_body(raw[1]))
    return {
        "messages": messages,
        "next_cursor": _first_int(fields, 2) or _first_int(fields, 3) or _first_int(fields, 5),
        "has_more": bool(_first_int(fields, 4) or _first_int(fields, 6)),
    }


def first_conversation(response: dict[str, Any]) -> ConversationInfo | None:
    items = (
        response.get("body", {})
        .get("create_conversation_v2_body", {})
        .get("conversation_info_list", [])
    )
    if not items:
        return None
    item = items[0]
    conversation_id = str(item.get("conversation_id") or "").strip()
    ticket = str(item.get("ticket") or "").strip()
    short_id = int(item.get("conversation_short_id") or 0)
    conversation_type = int(item.get("conversation_type") or 1)
    if not conversation_id or not short_id or not ticket:
        return None
    return ConversationInfo(conversation_id, short_id, conversation_type, ticket)


def sent_message(response: dict[str, Any]) -> SentMessageInfo | None:
    notify = response.get("body", {}).get("new_message_notify", {})
    if not isinstance(notify, dict):
        return None
    item = notify.get("message", {})
    if not isinstance(item, dict):
        return None
    conversation_id = str(item.get("conversation_id") or notify.get("conversation_id") or "").strip()
    short_id = int(item.get("conversation_short_id") or 0)
    server_id = int(item.get("server_message_id") or 0)
    if not conversation_id or not short_id or not server_id:
        return None
    return SentMessageInfo(
        conversation_id=conversation_id,
        conversation_short_id=short_id,
        conversation_type=int(item.get("conversation_type") or notify.get("conversation_type") or 1),
        server_message_id=server_id,
        index_in_conversation=int(item.get("index_in_conversation") or 0),
        sender=int(item.get("sender") or 0),
        content=str(item.get("content") or ""),
    )


def parse_push_frame(data: bytes) -> dict[str, Any]:
    fields = _parse_fields(data)
    payload = _first_bytes(fields, 8)
    payload_type = _first_string(fields, 7)
    return {
        "seq_id": _first_int(fields, 1),
        "log_id": _first_int(fields, 2),
        "service": _first_int(fields, 3),
        "method": _first_int(fields, 4),
        "payload_encoding": _first_string(fields, 6),
        "payload_type": payload_type,
        "payload": payload,
        "response": parse_response(payload) if payload and payload_type == "pb" else None,
    }


def _parse_fields(data: bytes) -> dict[int, list[tuple[int, Any]]]:
    result: dict[int, list[tuple[int, Any]]] = {}
    index = 0
    size = len(data)
    while index < size:
        tag, index = _read_varint(data, index)
        field = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:
            value, index = _read_varint(data, index)
        elif wire_type == 2:
            length, index = _read_varint(data, index)
            value = data[index:index + length]
            index += length
        else:
            break
        result.setdefault(field, []).append((wire_type, value))
    return result


def _read_varint(data: bytes, index: int) -> tuple[int, int]:
    shift = 0
    value = 0
    while index < len(data):
        byte = data[index]
        index += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, index
        shift += 7
    return value, index


def _first_int(fields: dict[int, list[tuple[int, Any]]], field: int) -> int:
    for wire_type, value in fields.get(field, []):
        if wire_type == 0:
            return int(value)
    return 0


def _first_bytes(fields: dict[int, list[tuple[int, Any]]], field: int) -> bytes:
    for wire_type, value in fields.get(field, []):
        if wire_type == 2:
            return bytes(value)
    return b""


def _first_string(fields: dict[int, list[tuple[int, Any]]], field: int) -> str:
    raw = _first_bytes(fields, field)
    if not raw:
        return ""
    return raw.decode("utf-8", errors="replace")
