package com.modularis.identity.core.identity.messaging;

import com.fasterxml.jackson.annotation.JsonGetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@JsonIgnoreProperties(ignoreUnknown = true)
public record UserCompensationCommandMessage(
		@NotBlank String schemaVersion,
		@NotBlank String messageId,
		@NotBlank String correlationId,
		String causationId,
		@NotBlank String occurredAt,
		@NotBlank String type,
		@Valid UserCompensationCommandPayload payload
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
