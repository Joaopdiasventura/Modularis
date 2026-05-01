package com.modularis.identity.core.identity.messaging;

import jakarta.validation.constraints.NotBlank;

public record UserCompensationCommandPayload(
		@NotBlank String idempotencyKey,
		@NotBlank String userId,
		@NotBlank String reason
) {
}
