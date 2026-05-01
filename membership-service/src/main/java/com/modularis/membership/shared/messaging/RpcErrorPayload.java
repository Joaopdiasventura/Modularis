package com.modularis.membership.shared.messaging;

public record RpcErrorPayload(
		int status,
		String title,
		String detail,
		String code
) {
}
