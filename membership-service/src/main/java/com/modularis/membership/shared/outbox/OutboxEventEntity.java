package com.modularis.membership.shared.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
public class OutboxEventEntity {

	@Id
	private UUID id;

	@Column(name = "routing_key", nullable = false, length = 128)
	private String routingKey;

	@Column(name = "correlation_id", nullable = false, length = 64)
	private String correlationId;

	@Column(name = "causation_id", length = 64)
	private String causationId;

	@Column(name = "payload_json", nullable = false, columnDefinition = "text")
	private String payloadJson;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private OutboxEventStatus status;

	@Column(nullable = false)
	private int attempts;

	@Column(name = "next_attempt_at", nullable = false)
	private OffsetDateTime nextAttemptAt;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "published_at")
	private OffsetDateTime publishedAt;

	protected OutboxEventEntity() {
	}

	public OutboxEventEntity(
			UUID id,
			String routingKey,
			String correlationId,
			String causationId,
			String payloadJson
	) {
		this.id = id;
		this.routingKey = routingKey;
		this.correlationId = correlationId;
		this.causationId = causationId;
		this.payloadJson = payloadJson;
		this.status = OutboxEventStatus.PENDING;
		this.attempts = 0;
		this.nextAttemptAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	@PrePersist
	void onCreate() {
		this.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	public void markPublished() {
		this.status = OutboxEventStatus.PUBLISHED;
		this.publishedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	public void scheduleRetry() {
		this.attempts += 1;
		long backoffSeconds = Math.min(30, (long) Math.pow(2, Math.min(this.attempts, 5)));
		this.nextAttemptAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(backoffSeconds);
	}

	public UUID getId() {
		return id;
	}

	public String getRoutingKey() {
		return routingKey;
	}

	public String getCorrelationId() {
		return correlationId;
	}

	public String getCausationId() {
		return causationId;
	}

	public String getPayloadJson() {
		return payloadJson;
	}

	public OutboxEventStatus getStatus() {
		return status;
	}
}
