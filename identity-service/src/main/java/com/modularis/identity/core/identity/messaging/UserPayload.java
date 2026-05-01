package com.modularis.identity.core.identity.messaging;

public record UserPayload(
		String id,
		String email,
		String name,
		boolean isPremium
) {
}
