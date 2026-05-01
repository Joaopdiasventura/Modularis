package com.modularis.membership.shared.inbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "consumed_message_receipts")
public class ConsumedMessageReceiptEntity {

	@Id
	@Column(name = "message_id", nullable = false, length = 64)
	private String messageId;

	@Column(name = "consumer_name", nullable = false, length = 120)
	private String consumerName;

	@Column(name = "event_type", nullable = false, length = 120)
	private String eventType;

	@Column(name = "correlation_id", nullable = false, length = 64)
	private String correlationId;

	@Column(name = "processed_at", nullable = false)
	private OffsetDateTime processedAt;

	protected ConsumedMessageReceiptEntity() {
	}

	public ConsumedMessageReceiptEntity(String messageId, String consumerName, String eventType, String correlationId) {
		this.messageId = messageId;
		this.consumerName = consumerName;
		this.eventType = eventType;
		this.correlationId = correlationId;
	}

	@PrePersist
	void onCreate() {
		this.processedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	public String getMessageId() {
		return messageId;
	}

	public String getConsumerName() {
		return consumerName;
	}

	public String getEventType() {
		return eventType;
	}

	public String getCorrelationId() {
		return correlationId;
	}

	public OffsetDateTime getProcessedAt() {
		return processedAt;
	}
}
