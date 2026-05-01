package com.modularis.identity.core.identity.messaging;

public record CompensationCommandResult(
		boolean compensated,
		boolean replayed
) {
}
