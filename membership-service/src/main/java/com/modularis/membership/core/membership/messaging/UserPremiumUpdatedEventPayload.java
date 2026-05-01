package com.modularis.membership.core.membership.messaging;

public record UserPremiumUpdatedEventPayload(
		String id,
		boolean isPremium
) {
}
