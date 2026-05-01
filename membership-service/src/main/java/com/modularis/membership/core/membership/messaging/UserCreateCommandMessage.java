package com.modularis.membership.core.membership.messaging;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonGetter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@JsonIgnoreProperties(ignoreUnknown = true)
public record UserCreateCommandMessage(
		@NotBlank String schemaVersion,
		@NotBlank String messageId,
		@NotBlank String correlationId,
		String causationId,
		@NotBlank String occurredAt,
		@NotBlank String type,
		@Valid UserCreateCommandPayload payload
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
