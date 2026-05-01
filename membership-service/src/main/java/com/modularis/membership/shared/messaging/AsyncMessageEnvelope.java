package com.modularis.membership.shared.messaging;

import com.fasterxml.jackson.annotation.JsonGetter;

public record AsyncMessageEnvelope<T>(
		String schemaVersion,
		String messageId,
		String correlationId,
		String causationId,
		String occurredAt,
		String type,
		String source,
		T payload
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
