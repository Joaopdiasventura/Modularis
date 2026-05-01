package com.modularis.membership.core.membership.messaging;

import com.fasterxml.jackson.annotation.JsonGetter;

public record UserPremiumUpdatedEventMessage(
		String schemaVersion,
		String messageId,
		String correlationId,
		String causationId,
		String occurredAt,
		String type,
		UserPremiumUpdatedEventPayload payload
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

	@JsonGetter("source")
	public String source() {
		return "user-service";
	}
}
