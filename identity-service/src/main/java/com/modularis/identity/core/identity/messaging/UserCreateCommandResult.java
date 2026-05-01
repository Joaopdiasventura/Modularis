package com.modularis.identity.core.identity.messaging;

public record UserCreateCommandResult(
		UserPayload user,
		boolean replayed
) {
}
