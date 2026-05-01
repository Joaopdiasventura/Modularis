package com.modularis.membership.core.membership.messaging;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record UserCreateCommandPayload(
		@NotBlank String idempotencyKey,
		@NotBlank String requestHash,
		@NotBlank @Email String email,
		@NotBlank String name,
		@NotBlank String cellphone,
		@NotBlank String taxId
) {
}
