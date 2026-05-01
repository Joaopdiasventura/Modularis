package com.modularis.membership.core.membership.messaging;

public record UserCreateCommandResult(
		UserPayload user,
		boolean replayed
) {
}
