package com.modularis.membership.core.membership.messaging;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PaymentConfirmedEventPayload(
		String paymentId,
		String userId,
		String paymentStatus,
		String deliveryStatus,
		String confirmedAt,
		String expiresAt
) {
}
