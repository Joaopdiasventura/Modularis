package com.modularis.membership.core.membership.messaging;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonGetter;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PaymentConfirmedEventMessage(
		String schemaVersion,
		String messageId,
		String correlationId,
		String causationId,
		String occurredAt,
		String type,
		PaymentConfirmedEventPayload payload
) {
	@JsonGetter("eventVersion")
	public String eventVersion() {
		return schemaVersion;
	}

	@JsonGetter("id")
	public String id() {
		return messageId;
	}

	@JsonGetter("timestamp")
	public String timestamp() {
		return occurredAt;
	}

	@JsonGetter("eventType")
	public String eventType() {
		return type;
	}
}
