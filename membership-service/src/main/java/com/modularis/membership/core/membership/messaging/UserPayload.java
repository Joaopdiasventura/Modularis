package com.modularis.membership.core.membership.messaging;

public record UserPayload(
		String id,
		String email,
		String name,
		boolean isPremium
) {
}
