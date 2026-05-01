package com.modularis.membership.shared.messaging;

public record RpcSuccessResponse<T>(
		boolean success,
		T data
) {
	public static <T> RpcSuccessResponse<T> of(T data) {
		return new RpcSuccessResponse<>(true, data);
	}
}
