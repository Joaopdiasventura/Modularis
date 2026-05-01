package com.modularis.identity.shared.messaging;

public record RpcErrorPayload(
		int status,
		String title,
		String detail,
		String code
) {
}
