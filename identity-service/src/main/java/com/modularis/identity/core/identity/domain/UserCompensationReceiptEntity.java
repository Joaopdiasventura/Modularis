package com.modularis.identity.core.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "user_compensation_receipts")
public class UserCompensationReceiptEntity {

	@Id
	@Column(name = "idempotency_key", length = 128)
	private String idempotencyKey;

	@Column(name = "correlation_id", nullable = false, length = 64)
	private String correlationId;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected UserCompensationReceiptEntity() {
	}

	public UserCompensationReceiptEntity(
			String idempotencyKey,
			String correlationId,
			UUID userId
	) {
		this.idempotencyKey = idempotencyKey;
		this.correlationId = correlationId;
		this.userId = userId;
	}

	@PrePersist
	void onCreate() {
		var now = OffsetDateTime.now(ZoneOffset.UTC);
		this.createdAt = now;
		this.updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public UUID getUserId() {
		return userId;
	}
}
