package com.modularis.membership.shared.messaging;

public record RpcErrorResponse(
		boolean success,
		RpcErrorPayload error
) {
	public static RpcErrorResponse of(int status, String title, String detail, String code) {
		return new RpcErrorResponse(false, new RpcErrorPayload(status, title, detail, code));
	}
}
